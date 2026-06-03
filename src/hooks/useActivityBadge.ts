import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { useAuth } from './useAuth';
import { getLastSeenActivityTs, setLastSeenActivityTs } from '../utils/activityNotifications';

// Returns the unread activity count for the current user (admin or editor),
// plus a `markSeen()` to clear it. The actor's own activity never counts
// (they already know what they did). Viewers always get count=0.
export function useActivityBadge() {
  const { currentUser, canEdit } = useAuth();
  const log = useSelector((s: RootState) => s.activity.log);

  const [lastSeen, setLastSeen] = useState<string>(() =>
    currentUser ? getLastSeenActivityTs(currentUser.id) : ''
  );

  // Re-read when the user switches.
  useEffect(() => {
    if (currentUser) setLastSeen(getLastSeenActivityTs(currentUser.id));
  }, [currentUser?.id]);

  const count = (canEdit && currentUser)
    ? log.filter(e => e.timestamp > lastSeen && e.userId !== currentUser.id).length
    : 0;

  const markSeen = useCallback(() => {
    if (!currentUser) return;
    const latest = log[0]?.timestamp ?? new Date().toISOString();
    setLastSeenActivityTs(currentUser.id, latest);
    setLastSeen(latest);
  }, [currentUser, log]);

  return { count, markSeen };
}
