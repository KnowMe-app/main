import { useCallback, useEffect, useRef, useState } from 'react';

import { auth } from 'components/config';
import {
  advanceCardFormPending,
  readCardFormPending,
  rememberCardFormPending,
  settleCardFormPending,
} from 'utils/cardFormPendingEdits';
import { proposalEditorKey, recoverEditorDraft, saveEditorProposal } from 'utils/profileProposalEditor';
import { profileProposalService } from 'utils/profileProposalRepository';

const idle = { state: 'idle', at: 0 };
const modified = { state: 'modified', at: 0 };
const failureState = error => ({
  state: (error?.code || error?.message) === 'REVISION_CONFLICT' ? 'conflict' : 'error',
  at: 0,
});

const rememberEdit = (editor, draft, needsBlur = false) => {
  const at = rememberCardFormPending(editor.uid, editor.target, draft, {
    expected: editor.expected,
    targetKey: proposalEditorKey(editor.locator),
    basis: editor.visible ?? null,
    sessionId: editor.sessionId,
    needsBlur,
  });
  editor.latestAt = at;
  return at;
};

export function useProfileProposalEditor({ uid, onRestore, onCreateSaved, onSaved, onError }) {
  const editorRef = useRef(null);
  const viewer = useRef(uid);
  const callbacks = useRef({});
  const [autosave, setAutosave] = useState(idle);
  const [loaded, setLoaded] = useState(null);
  viewer.current = uid;
  callbacks.current = { onRestore, onCreateSaved, onSaved, onError };

  useEffect(() => () => { editorRef.current = null; }, []);

  const beginEditor = useCallback(session => {
    const sessionId = window.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
    const editor = { ...session, sessionId };
    editorRef.current = editor;
    setLoaded(null);
    setAutosave(idle);
    return editor;
  }, []);

  const endEditor = useCallback(() => {
    editorRef.current = null;
    setLoaded(null);
    setAutosave(idle);
  }, []);

  const persistDraft = useCallback(nextDraft => {
    const editor = editorRef.current;
    if (!editor) return Promise.reject(new Error('INVALID_DRAFT'));
    if (editor.readOnly) return Promise.reject(new Error('PERMISSION_DENIED'));
    if (editor.recoveryConflict) return Promise.reject(editor.failure);

    const pendingAt = rememberEdit(editor, nextDraft);
    if (editor.failure) {
      setAutosave(failureState(editor.failure));
      return Promise.reject(editor.failure);
    }
    const isActive = () => editorRef.current === editor && viewer.current === editor.uid;
    const isLatest = () => isActive() && editor.latestAt === pendingAt;
    setAutosave({ state: 'saving', at: 0 });

    // A closed form may finish its own queued write. Its acknowledgment can
    // settle that local entry and only updates the form that queued it.
    const run = async () => {
      if (editor.failure) throw editor.failure;
      if (auth.currentUser?.uid !== editor.uid) throw new Error('PERMISSION_DENIED');
      const previous = editor.expected;
      const saved = await saveEditorProposal(profileProposalService, editor, nextDraft);
      editor.expected = saved;
      editor.visible = nextDraft;
      if (saved?.operation === 'create') {
        editor.base = saved.data;
        if (isActive()) callbacks.current.onCreateSaved(saved);
      }
      settleCardFormPending(editor.uid, editor.target, pendingAt, { sessionId: editor.sessionId });
      advanceCardFormPending(editor.uid, editor.target, previous, saved, pendingAt, {
        latestAt: editor.latestAt, basis: nextDraft, sessionId: editor.sessionId,
      });
      if (isLatest()) {
        callbacks.current.onSaved(saved);
        setAutosave(saved || previous ? { state: 'saved', at: Date.now() } : idle);
      }
      return saved;
    };

    const queued = (editor.tail || Promise.resolve()).then(run).catch(error => {
      editor.failure = error;
      if (isLatest()) setAutosave(failureState(error));
      throw error;
    });
    editor.lastWrite = queued;
    editor.tail = queued.catch(() => {});
    return queued;
  }, []);

  const rememberTyping = useCallback(draft => {
    const editor = editorRef.current;
    if (!editor || editor.readOnly || editor.recoveryConflict) return;
    rememberEdit(editor, draft, true);
    if (!editor.failure) setAutosave(modified);
  }, []);

  useEffect(() => {
    if (!loaded || loaded !== editorRef.current || loaded.uid !== uid) return;
    setLoaded(null);
    if (loaded.readOnly) return;
    const pending = readCardFormPending(uid, loaded.target);
    if (!pending) return;

    const restored = !loaded.failure && recoverEditorDraft(loaded, pending);
    if (!restored) {
      loaded.recoveryConflict = true;
      loaded.failure ||= new Error('REVISION_CONFLICT');
      setAutosave({ state: 'conflict', at: 0 });
      return;
    }
    callbacks.current.onRestore(restored);
    if (pending.needsBlur) {
      loaded.latestAt = pending.at;
      setAutosave(modified);
      return;
    }
    persistDraft(restored).catch(error => callbacks.current.onError(error));
  }, [loaded, persistDraft, uid]);

  return { editorRef, beginEditor, endEditor, markLoaded: setLoaded, autosave, persistDraft, rememberTyping };
}
