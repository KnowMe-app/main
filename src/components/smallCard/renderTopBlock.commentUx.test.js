import fs from 'fs';
import path from 'path';

describe('smallCard comment UI fixes', () => {
  const source = fs.readFileSync(path.join(__dirname, 'renderTopBlock.js'), 'utf8');

  it('portals the multiData comment edit/delete modals to document.body so they render above ProfileForm inputs', () => {
    const commentModalIndex = source.indexOf('isCommentModalOpen && typeof document');
    const deleteModalIndex = source.indexOf('commentToDelete && typeof document');
    expect(commentModalIndex).toBeGreaterThan(-1);
    expect(deleteModalIndex).toBeGreaterThan(-1);

    const commentModalBody = source.slice(commentModalIndex, deleteModalIndex);
    expect(commentModalBody).toContain('createPortal(');
    expect(commentModalBody).toContain('document.body');

    const deleteModalBody = source.slice(deleteModalIndex, deleteModalIndex + 1500);
    expect(deleteModalBody).toContain('createPortal(');
    expect(deleteModalBody).toContain('document.body');
  });

  it('excludes the current admin\'s own comment from the read-only multiData list, since FieldComment already edits it', () => {
    expect(source).toContain('const otherAdminsComments = React.useMemo(');
    expect(source).toContain(
      "return multiDataComments.filter(comment => (comment.ownerId || comment.authorId || '') !== currentUid);"
    );
    expect(source).toContain('{otherAdminsComments.map(comment => (');
    expect(source).not.toContain('{multiDataComments.map(comment => (');
  });

  it('loads shared comments only for the current card and reuses the cached viewer profile', () => {
    expect(source).toContain('getCard(viewerId) || await fetchUserById(viewerId)');
    expect(source).toContain('fetchAllCommentsByCardId(cardData.userId, ownerIds)');
    expect(source).not.toContain('fetchAllCommentsByCardId(cardData.userId);');
  });
});

// Публічний відгук лежить в іншому сховищі, ніж нотатка адміна, і має інші
// наслідки: нотатку бачать кілька адмінів, відгук — уся база. У списку вони
// стоять поруч, тож різницю мусить нести і рядок, і кожен шлях запису.
describe('публічні відгуки в блоці картки', () => {
  const source = fs.readFileSync(path.join(__dirname, 'renderTopBlock.js'), 'utf8');

  it('читає відгуки разом із карткою, а не на окремий дотик', () => {
    expect(source).toContain('fetchPublicProfileCommentsStrict([profileId])');
    // Завантаження висить на самому відкритті картки: кнопки «перевірити, чи є
    // відгуки» в звичайному шляху більше немає.
    expect(source).toContain('React.useEffect(() => {\n    loadPublicComments();\n  }, [loadPublicComments]);');
    expect(source).not.toContain('Завантажити публічні відгуки');
    // Порожня картка скидає обидва списки — інакше відгуки попередньої
    // лишились би висіти під наступною.
    expect(source).toContain('setPublicComments([]);');
  });

  it('тримає ціну цього читання памʼяттю таба, а не повторним запитом на кожен показ', () => {
    expect(source).toContain('const publicCommentsMemoryCache = new Map();');
    expect(source).toContain('readPublicCommentsCached(profileId, { force })');
    // Відмова в кеші не лишається, інакше одна мережева помилка тримала б
    // картку порожньою весь строк памʼяті.
    expect(source).toContain('publicCommentsMemoryCache.delete(profileId);');
    // Свій же запис робить кеш застарілим — інакше правка відгуку зникала б
    // при наступному відкритті тієї ж картки.
    expect(source).toContain('dropCachedPublicComments(cardData.userId);');
  });

  it('після відмови показує кнопку повтору й каже про відмову один раз', () => {
    expect(source).toContain('catch (error) {');
    expect(source).toContain('Не вдалося завантажити публічні відгуки');
    expect(source).toContain("id: 'public-comments-load-failed',");
    expect(source).toContain('setPublicCommentsFailed(true);');
    expect(source).toContain('{publicCommentsFailed && (');
    expect(source).toContain('onClick={retryPublicComments}');
    expect(source).toContain('loadPublicComments({ force: true })');
    expect(source).toContain('setPublicCommentsLoading(false)');
  });

  it('показує відгук окремим рядком, помітно іншим за нотатку', () => {
    expect(source).toContain('{publicComments.map(comment => {');
    expect(source).toContain('style={publicCommentRowStyle}');
    expect(source).toContain('Публічний відгук — його бачить кожен користувач бази');
    // Три ознаки одразу: смуга збоку, власний колір тексту й імʼя автора.
    expect(source).toContain('borderLeft: \'2px solid #7fd1a8\'');
    expect(source).toContain('style={publicCommentAuthorStyle}');
  });

  it('правка й видалення відгуку йдуть у публічне дерево, а не в нотатку власника', () => {
    const saveBody = source.slice(
      source.indexOf('const savePublicComment = async () => {'),
      source.indexOf('const saveMultiComment = async () => {'),
    );
    expect(saveBody).toContain('updatePublicProfileComment({');
    expect(saveBody).not.toContain('updateCommentByOwner');

    expect(source).toContain("if (selectedComment?.kind === 'public') {");
    expect(source).toContain("if (comment?.kind === 'public') {");
    expect(source).toContain('deletePublicProfileComment({ profileId: cardData.userId, commentId: comment.commentId })');
  });

  it('чужий відгук читається, але не відкривається на правку', () => {
    // Те саме коло, що й у правилі бази: автор і адмін, більше ніхто.
    expect(source).toContain('const canModifyPublicComment = comment => (');
    expect(source).toContain("isAdmin || (Boolean(comment?.authorId) && comment.authorId === (auth.currentUser?.uid || ''))");
    expect(source).toContain('if (!canModify) return;');
  });
});
