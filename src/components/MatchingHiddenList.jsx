import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { FaUndo } from 'react-icons/fa';
import {
  addContactViewUser,
  addDislikeUser,
  fetchUserComments,
  lazyLoadProfilePhotos,
  removeDislikeUser,
  saveMyCardComment,
} from './config';
import { setDislike, cacheDislikedUsers } from 'utils/dislikesStorage';
import { loadComments, saveComments, setLocalComment } from 'utils/commentsStorage';
import { removeCardFromList } from 'utils/cardsStorage';
import ProfileRow from './ProfileRow';
import * as S from './MatchingHiddenList.styled';

const PAGE_SIZE = 20;
const NOTE_TOAST_UNDO_MS = 5000;

// The hidden list's row-expand state is local component state, so it's lost
// whenever the pencil button navigates to the admin-only /edit/:userId route
// and back (a separate route, remounting this component). Persist it across
// that round trip in sessionStorage, same lifetime as the scroll position.
const EXPANDED_IDS_KEY = 'matchingHiddenExpandedIds';
const loadPersistedExpandedIds = () => {
  try {
    const raw = sessionStorage.getItem(EXPANDED_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};
const persistExpandedIds = ids => {
  try {
    sessionStorage.setItem(EXPANDED_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore write errors
  }
};

const SkeletonRows = ({ count }) => (
  <>
    {Array.from({ length: count }).map((_, idx) => (
      // eslint-disable-next-line react/no-array-index-key
      <S.SkeletonRow key={`hidden-skeleton-${idx}`}>
        <S.SkeletonPhoto />
        <S.SkeletonLines>
          <S.SkeletonLine $w="55%" $h="13px" />
          <S.SkeletonLine $w="40%" $h="10px" />
          <S.SkeletonLine $w="85%" $h="10px" />
        </S.SkeletonLines>
      </S.SkeletonRow>
    ))}
  </>
);

const MatchingHiddenList = ({
  ownerId,
  users,
  hasMore,
  loading,
  loadMore,
  dislikeUsers,
  setDislikeUsers,
  ownDislikeUsers,
  setOwnDislikeUsers,
  isAdmin,
  onGoToFeed,
  onEditProfile,
  onOpenProfile,
}) => {
  const [expandedIds, setExpandedIds] = useState(() => loadPersistedExpandedIds());
  const [photosByUserId, setPhotosByUserId] = useState({});
  const [commentsByUserId, setCommentsByUserId] = useState({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const photoRequestedRef = useRef(new Set());
  const commentRequestedRef = useRef(new Set());
  const contactViewKeysRef = useRef(new Set());
  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  useEffect(() => {
    const pending = users.filter(user => (
      user?.userId
      && !user.__photosHydrated
      && !photosByUserId[user.userId]
      && !photoRequestedRef.current.has(user.userId)
    ));
    if (!pending.length) return;
    pending.forEach(user => {
      photoRequestedRef.current.add(user.userId);
      lazyLoadProfilePhotos(user.userId, user.__sourceCollection)
        .then(photos => {
          setPhotosByUserId(prev => ({ ...prev, [user.userId]: Array.isArray(photos) ? photos : [] }));
        })
        .catch(() => {
          setPhotosByUserId(prev => ({ ...prev, [user.userId]: [] }));
        });
    });
  }, [users, photosByUserId]);

  // The client's personal note about why a card was hidden lives in
  // multiData/comments/{ownerId}/{cardId} (see config.js's fetchUserComments/
  // saveMyCardComment), not on the profile record itself - same store the
  // full profile card's "Comment" box reads from in Matching.jsx.
  useEffect(() => {
    if (!ownerId) return;
    const pendingIds = users
      .map(user => user?.userId)
      .filter(Boolean)
      .filter(userId => !(userId in commentsByUserId) && !commentRequestedRef.current.has(userId));
    if (!pendingIds.length) return;

    const cachedForOwner = loadComments()[ownerId] || {};
    const fromCache = {};
    const toFetch = [];
    pendingIds.forEach(userId => {
      commentRequestedRef.current.add(userId);
      if (cachedForOwner[userId]) fromCache[userId] = cachedForOwner[userId].text || '';
      else toFetch.push(userId);
    });
    if (Object.keys(fromCache).length) {
      setCommentsByUserId(prev => ({ ...prev, ...fromCache }));
    }
    if (!toFetch.length) return;

    fetchUserComments(ownerId, toFetch)
      .then(result => {
        const textByUserId = {};
        toFetch.forEach(userId => { textByUserId[userId] = result[userId]?.text || ''; });
        setCommentsByUserId(prev => ({ ...prev, ...textByUserId }));
        const allComments = loadComments();
        allComments[ownerId] = { ...(allComments[ownerId] || {}), ...result };
        saveComments(allComments);
      })
      .catch(error => {
        console.error('[MatchingHiddenList] Failed to load comments', error);
        const fallback = {};
        toFetch.forEach(userId => { fallback[userId] = ''; });
        setCommentsByUserId(prev => ({ ...prev, ...fallback }));
      });
  }, [users, ownerId, commentsByUserId]);

  const rows = useMemo(() => users
    .filter(user => user?.userId)
    .map(user => {
      const photoOverride = photosByUserId[user.userId];
      if (!photoOverride || !photoOverride.length) return user;
      return { ...user, photos: photoOverride };
    })
    .sort((a, b) => (Number(dislikeUsers[b.userId]) || 0) - (Number(dislikeUsers[a.userId]) || 0)),
  [users, photosByUserId, dislikeUsers]);

  const handleCommentSave = useCallback(async (user, text) => {
    const userId = user?.userId;
    if (!userId || !ownerId) return;
    setCommentsByUserId(prev => ({ ...prev, [userId]: text }));
    try {
      const res = await saveMyCardComment(userId, text, ownerId);
      setLocalComment(ownerId, userId, text, res?.lastAction);
    } catch (error) {
      console.error('[MatchingHiddenList] Failed to save comment', error);
      toast.error('Не вдалося зберегти коментар');
    }
  }, [ownerId]);

  const handleToggleExpand = useCallback(userId => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      persistExpandedIds(next);
      return next;
    });
  }, []);

  const handleContactsOpened = useCallback(user => {
    if (!user?.userId) return;
    const trackKey = `${ownerId || ''}:${user.userId}`;
    if (contactViewKeysRef.current.has(trackKey)) return;
    contactViewKeysRef.current.add(trackKey);
    void addContactViewUser(user.userId, ownerId);
  }, [ownerId]);

  const handleUndo = useCallback((user, previousDislikedAt) => {
    const userId = user?.userId;
    if (!userId || !ownerId) return;
    const timestamp = typeof previousDislikedAt === 'number' ? previousDislikedAt : Date.now();
    setDislikeUsers(prev => ({ ...prev, [userId]: timestamp }));
    if (setOwnDislikeUsers) {
      setOwnDislikeUsers(prev => ({ ...(prev || {}), [userId]: timestamp }));
    }
    setDislike(userId, true);
    cacheDislikedUsers({ [userId]: user });
    addDislikeUser(userId, ownerId, timestamp).catch(error => {
      console.error('[MatchingHiddenList] Failed to restore dislike:', error);
    });
  }, [ownerId, setDislikeUsers, setOwnDislikeUsers]);

  const handleReturn = useCallback(user => {
    const userId = user?.userId;
    if (!userId || !ownerId) return;
    const previousDislikedAt = dislikeUsers[userId];

    setDislikeUsers(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    if (setOwnDislikeUsers) {
      setOwnDislikeUsers(prev => {
        const next = { ...(prev || {}) };
        delete next[userId];
        return next;
      });
    }
    setDislike(userId, false);
    removeCardFromList(userId, 'dislike');
    removeDislikeUser(userId, ownerId).catch(error => {
      console.error('[MatchingHiddenList] Failed to remove dislike:', error);
    });

    toast.custom(t => (
      <S.ToastWrap>
        <span>Анкету повернуто</span>
        <S.ToastUndo
          onClick={() => {
            handleUndo(user, previousDislikedAt);
            toast.dismiss(t.id);
          }}
        >
          Скасувати
        </S.ToastUndo>
      </S.ToastWrap>
    ), { duration: NOTE_TOAST_UNDO_MS });
  }, [dislikeUsers, handleUndo, ownerId, setDislikeUsers, setOwnDislikeUsers]);

  const returnAction = useMemo(() => ({
    icon: <FaUndo size={13} />,
    title: 'Повернути в загальний список',
    onClick: handleReturn,
  }), [handleReturn]);

  const fetchNextPage = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setLoadError(false);
    try {
      await loadMoreRef.current({
        currentVisibleCount: rows.length,
        targetVisibleCount: rows.length + PAGE_SIZE,
        limit: PAGE_SIZE,
      });
    } catch (error) {
      console.error('[MatchingHiddenList] Failed to load more hidden profiles', error);
      setLoadError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, rows.length]);

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        fetchNextPage();
      }
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore]);

  useEffect(() => {
    if (!loading && !isLoadingMore && !loadError && hasMore && rows.length > 0 && rows.length < PAGE_SIZE) {
      fetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, hasMore, loading, isLoadingMore, loadError]);

  const showInitialSkeleton = loading && rows.length === 0;
  const showEmptyState = !loading && !showInitialSkeleton && rows.length === 0 && !loadError;

  return (
    <S.Wrap>
      {showEmptyState ? (
        <S.EmptyState>
          <S.EmptyStateTitle>Тут поки порожньо</S.EmptyStateTitle>
          <S.EmptyStateText>Тут зберігаються анкети, які ви прибрали зі стрічки.</S.EmptyStateText>
          {onGoToFeed && (
            <S.EmptyStateButton type="button" onClick={onGoToFeed}>До стрічки</S.EmptyStateButton>
          )}
        </S.EmptyState>
      ) : (
        <S.List>
          {rows.map(user => (
            <ProfileRow
              key={user.userId}
              user={user}
              isAdmin={isAdmin}
              expanded={expandedIds.has(user.userId)}
              onToggleExpand={handleToggleExpand}
              onOpen={onOpenProfile}
              primaryAction={returnAction}
              onEditProfile={onEditProfile}
              onContactsOpened={handleContactsOpened}
              clientComment={commentsByUserId[user.userId] || ''}
              onCommentSave={handleCommentSave}
            />
          ))}

          {showInitialSkeleton && <SkeletonRows count={4} />}
          {!showInitialSkeleton && isLoadingMore && <SkeletonRows count={2} />}

          {loadError && (
            <S.ErrorRow>
              Не вдалося завантажити
              <S.RetryButton type="button" onClick={fetchNextPage}>Спробувати ще</S.RetryButton>
            </S.ErrorRow>
          )}

          <S.Sentinel ref={sentinelRef} />

          {!hasMore && rows.length > 0 && (
            <S.FooterNote>Приховані анкети бачите тільки ви</S.FooterNote>
          )}
        </S.List>
      )}
    </S.Wrap>
  );
};

export default MatchingHiddenList;
