'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { FORGETTING_STAGES, calculateRandomScheduleTime } from '@/lib/scheduler';

type Memo = {
  id: string;
  type: 'question' | 'simple';
  title: string;
  answer?: string;
  tag?: string;
  created_at: string;
};

type ReviewTask = {
  schedule_id: string;
  stage: number;
  memo: Memo;
};

// 猫の成長ランク定義
const CAT_STAGES = [
  { level: 1, name: 'LV.1 こねこ', minLove: 0, status: '腹ペコ', emoji: '🐱' },
  { level: 2, name: 'LV.2 すこやか猫', minLove: 100, status: 'ごきげん', emoji: '😸' },
  { level: 3, name: 'LV.3 サイバーにゃん', minLove: 300, status: 'ウキウキ', emoji: '😺' },
  { level: 4, name: 'LV.4 まっちょ猫', minLove: 600, status: 'むきむき', emoji: '😼' },
  { level: 5, name: 'LV.MAX 神猫', minLove: 1000, status: '神々しい', emoji: '😻' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'review' | 'memos' | 'practice' | 'analytics' | 'settings'>('review');

  const [memos, setMemos] = useState<Memo[]>([]);
  const [todayTasks, setTodayTasks] = useState<ReviewTask[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('ALL');

  // 🔍 検索＆シャッフル用ステート
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isShuffled, setIsShuffled] = useState<boolean>(false);

  // 🎯 目標設定用ステート
  const [targetTitle, setTargetTitle] = useState<string>('AWS 12冠 / 試験');
  const [targetDate, setTargetDate] = useState<string>('');
  const [isEditingTarget, setIsEditingTarget] = useState<boolean>(false);

  // 💰 お金（コイン）と育成ステート
  const [coins, setCoins] = useState<number>(0);
  const [catLove, setCatLove] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [lastReviewDate, setLastReviewDate] = useState<string>('');
  const [totalCompleted, setTotalCompleted] = useState<number>(0);
  const [totalReset, setTotalReset] = useState<number>(0);
  const [activityLog, setActivityLog] = useState<{ [date: string]: number }>({});
  const [feedEffect, setFeedEffect] = useState<string | null>(null);

  // 🔄 復習(review)モード用インデックス
  const [reviewIndex, setReviewIndex] = useState<number>(0);

  // 🎮 一覧(practice)復習モード用ステート
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [quizQueue, setQuizQueue] = useState<Memo[]>([]);
  const [quizIndex, setQuizIndex] = useState<number>(0);

  // 回答表示トグル用ステート
  const [showCurrentAnswer, setShowCurrentAnswer] = useState<boolean>(false);

  // 👆 ドラッグ / スワイプ連動用ステート
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [flyOutDirection, setFlyOutDirection] = useState<'left' | 'right' | null>(null);
  
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isMoved = useRef<boolean>(false);

  // アコーディオン開閉状態 (一覧表示用)
  const [showAnswerPracticeMap, setShowAnswerPracticeMap] = useState<{ [key: string]: boolean }>({});

  // フォーム用
  const [type, setType] = useState<'question' | 'simple'>('question');
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');
  const [tag, setTag] = useState('');
  const [, setLoading] = useState(true);

  // Push通知ステート
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [, setStatus] = useState<string>('準備中');

  useEffect(() => {
    fetchData();

    // ローカルストレージからの読み込み
    const savedCoins = localStorage.getItem('cat_coins');
    const savedLove = localStorage.getItem('cat_love');
    const savedStreak = localStorage.getItem('physique_streak');
    const savedLastDate = localStorage.getItem('physique_last_date');
    const savedCompleted = localStorage.getItem('physique_total_completed');
    const savedReset = localStorage.getItem('physique_total_reset');
    const savedLog = localStorage.getItem('physique_activity_log');
    const savedTargetTitle = localStorage.getItem('target_title');
    const savedTargetDate = localStorage.getItem('target_date');

    if (savedCoins) setCoins(parseInt(savedCoins, 10));
    if (savedLove) setCatLove(parseInt(savedLove, 10));
    if (savedStreak) setStreak(parseInt(savedStreak, 10));
    if (savedLastDate) setLastReviewDate(savedLastDate);
    if (savedCompleted) setTotalCompleted(parseInt(savedCompleted, 10));
    if (savedReset) setTotalReset(parseInt(savedReset, 10));
    if (savedLog) setActivityLog(JSON.parse(savedLog));
    if (savedTargetTitle) setTargetTitle(savedTargetTitle);
    if (savedTargetDate) setTargetDate(savedTargetDate);
  }, []);

  const handleReviewReward = (isSuccess: boolean) => {
    const todayStr = new Date().toISOString().split('T')[0];

    if (isSuccess) {
      const newCoins = coins + 50; // 正解すると50コイン獲得
      setCoins(newCoins);
      localStorage.setItem('cat_coins', newCoins.toString());

      const newComp = totalCompleted + 1;
      setTotalCompleted(newComp);
      localStorage.setItem('physique_total_completed', newComp.toString());
    } else {
      const newRes = totalReset + 1;
      setTotalReset(newRes);
      localStorage.setItem('physique_total_reset', newRes.toString());
    }

    const newLog = { ...activityLog, [todayStr]: (activityLog[todayStr] || 0) + 1 };
    setActivityLog(newLog);
    localStorage.setItem('physique_activity_log', JSON.stringify(newLog));

    if (lastReviewDate !== todayStr) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setLastReviewDate(todayStr);
      localStorage.setItem('physique_streak', newStreak.toString());
      localStorage.setItem('physique_last_date', todayStr);
    }
  };

  const handleFeedCat = () => {
    const cost = 100;
    if (coins < cost) {
      alert('コインが足りません！復習を完了してコインを稼ぎましょう 💰');
      return;
    }

    const newCoins = coins - cost;
    const newLove = catLove + 30;

    setCoins(newCoins);
    setCatLove(newLove);
    localStorage.setItem('cat_coins', newCoins.toString());
    localStorage.setItem('cat_love', newLove.toString());

    setFeedEffect('豪華なごはんをあげた！ 🐟 (+30 LOVE)');
    setTimeout(() => setFeedEffect(null), 2500);
  };

  const getCurrentCatStage = () => {
    let current = CAT_STAGES[0];
    for (const stage of CAT_STAGES) {
      if (catLove >= stage.minLove) current = stage;
    }
    return current;
  };

  // 🎯 残り日数の計算
  const getRemainingDays = () => {
    if (!targetDate) return null;
    const target = new Date(targetDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchMemos(), fetchTodayTasks()]);
    setLoading(false);
  };

  const fetchMemos = async () => {
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMemos(data as Memo[]);
    }
  };

  const fetchTodayTasks = async () => {
    const nowISO = new Date().toISOString();

    const { data, error } = await supabase
      .from('schedules')
      .select(`
        id,
        stage,
        scheduled_at,
        completed,
        memo_id,
        memos (*)
      `)
      .lte('scheduled_at', nowISO)
      .eq('completed', false)
      .order('scheduled_at', { ascending: true });

    if (!error && data) {
      const uniqueMemoMap = new Map<string, ReviewTask>();

      for (const item of data) {
        if (item.memos && !uniqueMemoMap.has(item.memo_id)) {
          const rawMemo = Array.isArray(item.memos) ? item.memos[0] : item.memos;
          if (rawMemo) {
            uniqueMemoMap.set(item.memo_id, {
              schedule_id: item.id,
              stage: item.stage,
              memo: rawMemo as Memo,
            });
          }
        }
      }
      setTodayTasks(Array.from(uniqueMemoMap.values()));
    }
  };

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(async (reg) => {
          setStatus('準備完了');
          const existingSub = await reg.pushManager.getSubscription();
          if (existingSub) {
            setSubscription(existingSub);
            setStatus('通知オン');
          }
        })
        .catch(() => setStatus('エラー'));
    } else {
      setStatus('未対応');
    }
  }, []);

  const handleAddMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const formattedTag = tag.trim() ? tag.trim().toUpperCase() : null;

    const { data, error } = await supabase
      .from('memos')
      .insert([{ type, title, answer: type === 'question' ? answer : null, tag: formattedTag }])
      .select();

    if (error) {
      alert('保存失敗: ' + error.message);
      return;
    }

    if (data && data[0]) {
      const newMemo = data[0] as Memo;

      const scheduleInserts = FORGETTING_STAGES.map((days, index) => ({
        memo_id: newMemo.id,
        scheduled_at: calculateRandomScheduleTime(days),
        stage: index + 1,
        completed: false,
      }));

      await supabase.from('schedules').insert(scheduleInserts);

      if (subscription) {
        const pushTitle = newMemo.type === 'question' ? `🐱 猫がお腹を空かせています` : `📝 復習メモ`;
        const pushBody = newMemo.title;

        for (const item of scheduleInserts) {
          fetch('/api/schedule-forgetting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription,
              title: pushTitle,
              body: pushBody,
              scheduledAt: item.scheduled_at,
            }),
          }).catch((err) => console.error(err));
        }
      }

      setMemos([newMemo, ...memos]);
      setTitle('');
      setAnswer('');
      setTag('');
      fetchTodayTasks();
      alert('カードを作成しました！');
    }
  };

  const handleCompleteReview = async (scheduleId: string) => {
    setShowCurrentAnswer(false);
    setDragOffset({ x: 0, y: 0 });
    setFlyOutDirection(null);

    const { error } = await supabase
      .from('schedules')
      .update({ completed: true })
      .eq('id', scheduleId);

    if (!error) {
      const updated = todayTasks.filter((task) => task.schedule_id !== scheduleId);
      setTodayTasks(updated);
      handleReviewReward(true);
      if (reviewIndex >= updated.length && updated.length > 0) {
        setReviewIndex(updated.length - 1);
      }
    }
  };

  const handleResetReview = async (task: ReviewTask) => {
    setShowCurrentAnswer(false);
    setDragOffset({ x: 0, y: 0 });
    setFlyOutDirection(null);

    const { error } = await supabase
      .from('schedules')
      .update({
        stage: 1,
        scheduled_at: new Date().toISOString(),
        completed: false,
      })
      .eq('id', task.schedule_id);

    if (!error) {
      handleReviewReward(false);
      fetchTodayTasks();
    }
  };

  const handleResetScheduleForMemo = async (memoId: string) => {
    setShowCurrentAnswer(false);
    setDragOffset({ x: 0, y: 0 });
    setFlyOutDirection(null);

    const { error } = await supabase
      .from('schedules')
      .update({
        stage: 1,
        scheduled_at: new Date().toISOString(),
        completed: false,
      })
      .eq('memo_id', memoId);

    if (!error) {
      handleReviewReward(false);
      fetchTodayTasks();
    }
  };

  const togglePracticeAnswer = (memoId: string) => {
    setShowAnswerPracticeMap((prev) => ({ ...prev, [memoId]: !prev[memoId] }));
  };

  const handleDeleteMemo = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    const { error } = await supabase.from('memos').delete().eq('id', id);
    if (!error) {
      setMemos(memos.filter((memo) => memo.id !== id));
      setTodayTasks(todayTasks.filter((task) => task.memo.id !== id));
    }
  };

  const handleSubscribe = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });

      setSubscription(sub);
      setStatus('通知オン');
    } catch (err: any) {
      alert('エラー: ' + err.message);
    }
  };

  const handleStartQuiz = () => {
    const targetMemos = selectedTag === 'ALL' 
      ? filteredMemos 
      : filteredMemos.filter((m) => m.tag === selectedTag);

    if (targetMemos.length === 0) {
      alert('この条件のカードがありません');
      return;
    }

    const queue = isShuffled ? [...targetMemos].sort(() => Math.random() - 0.5) : targetMemos;
    setQuizQueue(queue);
    setQuizIndex(0);
    setShowCurrentAnswer(false);
    setIsQuizActive(true);
  };

  const handleQuizRemember = () => {
    setShowCurrentAnswer(false);
    setDragOffset({ x: 0, y: 0 });
    setFlyOutDirection(null);

    if (quizIndex < quizQueue.length - 1) {
      setQuizIndex((prev) => prev + 1);
    } else {
      setQuizIndex(quizQueue.length);
    }
  };

  const handleQuizForgot = async () => {
    const currentMemo = quizQueue[quizIndex];
    if (currentMemo) {
      await handleResetScheduleForMemo(currentMemo.id);
    }
    setShowCurrentAnswer(false);
    setDragOffset({ x: 0, y: 0 });
    setFlyOutDirection(null);

    if (quizIndex < quizQueue.length - 1) {
      setQuizIndex((prev) => prev + 1);
    } else {
      setQuizIndex(quizQueue.length);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    isMoved.current = false;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const diffX = e.clientX - touchStartPos.current.x;
    const diffY = e.clientY - touchStartPos.current.y;

    if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
      isMoved.current = true;
    }

    setDragOffset({ x: diffX, y: diffY });
  };

  const handlePointerCancel = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    setFlyOutDirection(null);
  };

  const handlePointerUp = (
    e: React.PointerEvent,
    mode: 'review' | 'quiz',
    taskOrMemo?: ReviewTask | Memo
  ) => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 100;

    if (!isMoved.current) {
      setShowCurrentAnswer((prev) => !prev);
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    if (dragOffset.x > threshold) {
      setFlyOutDirection('right');
      setTimeout(() => {
        if (mode === 'review' && taskOrMemo) {
          handleCompleteReview((taskOrMemo as ReviewTask).schedule_id);
        } else {
          handleQuizRemember();
        }
      }, 200);
    } else if (dragOffset.x < -threshold) {
      setFlyOutDirection('left');
      setTimeout(() => {
        if (mode === 'review' && taskOrMemo) {
          handleResetReview(taskOrMemo as ReviewTask);
        } else {
          handleQuizForgot();
        }
      }, 200);
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const allTags = Array.from(
    new Set(memos.map((m) => m.tag).filter((t): t is string => Boolean(t)))
  );

  const getFilteredMemos = () => {
    let result = memos;

    if (selectedTag !== 'ALL') {
      result = result.filter((m) => m.tag === selectedTag);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.answer && m.answer.toLowerCase().includes(q))
      );
    }

    if (isShuffled) {
      result = [...result].sort(() => Math.random() - 0.5);
    }

    return result;
  };

  const filteredMemos = getFilteredMemos();
  const filteredTodayTasks =
    selectedTag === 'ALL' ? todayTasks : todayTasks.filter((t) => t.memo.tag === selectedTag);

  const currentCatStage = getCurrentCatStage();
  const remainingDays = getRemainingDays();

  const getPast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  };

  const getCardTransformStyle = () => {
    if (flyOutDirection === 'right') {
      return {
        transform: 'translateX(500px) rotate(25deg)',
        opacity: 0,
        transition: 'all 0.25s ease-in',
      };
    }
    if (flyOutDirection === 'left') {
      return {
        transform: 'translateX(-500px) rotate(-25deg)',
        opacity: 0,
        transition: 'all 0.25s ease-in',
      };
    }

    const rotate = dragOffset.x * 0.08;
    return {
      transform: `translate(${dragOffset.x}px, ${dragOffset.y * 0.3}px) rotate(${rotate}deg)`,
      transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.27)',
    };
  };

  return (
    <div
      style={{
        backgroundColor: '#f8fafc',
        color: '#1e293b',
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px 16px 80px 16px',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      {/* ── HEADER ── */}
      <header
        style={{
          position: 'sticky',
          top: 12,
          zIndex: 50,
          backdropFilter: 'blur(16px)',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '480px',
          margin: '0 auto 24px auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: subscription ? '#10b981' : '#f59e0b',
            }}
          />
          <span style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a', letterSpacing: '-0.02em' }}>
            NekoMemo
          </span>
        </div>

        <div>
          {!subscription ? (
            <button
              onClick={handleSubscribe}
              style={{
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              通知を有効化
            </button>
          ) : (
            <span
              style={{
                fontSize: '11px',
                color: '#10b981',
                fontWeight: 700,
                backgroundColor: '#ecfdf5',
                padding: '4px 10px',
                borderRadius: '12px',
              }}
            >
              ACTIVE
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '480px', margin: '0 auto' }}>
        
        {/* ── 🎯 TARGET COUNTDOWN BANNER (目標設定・残り日数) ── */}
        <div
          style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            borderRadius: '20px',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: '0 10px 20px -5px rgba(15, 23, 42, 0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              🎯 目標までのカウントダウン
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
              {targetTitle}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {remainingDays !== null ? (
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>
                あと <span style={{ fontSize: '26px' }}>{remainingDays}</span> 日
              </div>
            ) : (
              <button
                onClick={() => setActiveTab('settings')}
                style={{ fontSize: '11px', color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                + 日付を設定
              </button>
            )}
          </div>
        </div>

        {/* ── 🐱 CAT CARD ── */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '24px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.04), 0 8px 10px -6px rgba(0,0,0,0.02)',
            border: '1px solid #f1f5f9',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '20px',
              fontSize: '56px',
              userSelect: 'none',
            }}
          >
            {currentCatStage.emoji}
          </div>

          {feedEffect && (
            <div
              style={{
                position: 'absolute',
                top: '30%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#10b981',
                color: '#ffffff',
                padding: '10px 20px',
                fontWeight: 700,
                fontSize: '13px',
                borderRadius: '20px',
                boxShadow: '0 10px 20px rgba(16, 185, 129, 0.3)',
                zIndex: 10,
              }}
            >
              {feedEffect}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>ステータス</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {currentCatStage.name}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>所持コイン（資金）</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                🪙 {coins} G
              </div>
            </div>
          </div>

          <button
            onClick={handleFeedCat}
            style={{
              width: '100%',
              marginTop: '16px',
              padding: '14px',
              backgroundColor: coins >= 100 ? '#f59e0b' : '#e2e8f0',
              color: coins >= 100 ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '16px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: coins >= 100 ? 'pointer' : 'not-allowed',
              boxShadow: coins >= 100 ? '0 10px 20px -3px rgba(245, 158, 11, 0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            ごちそうをあげる（100コイン消費）
          </button>

          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
              <span>なつき度 ({catLove} / 1000)</span>
              <span>{Math.floor((catLove / 1000) * 100)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (catLove / 1000) * 100)}%`,
                  backgroundColor: '#f59e0b',
                  borderRadius: '999px',
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── 🗂️ TAB NAVIGATION ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '4px',
            backgroundColor: '#e2e8f0',
            padding: '4px',
            borderRadius: '16px',
            marginBottom: '20px',
          }}
        >
          {[
            { id: 'review', label: `復習(${todayTasks.length})` },
            { id: 'practice', label: '一覧' },
            { id: 'analytics', label: '記録' },
            { id: 'memos', label: '作成' },
            { id: 'settings', label: '目標' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setIsQuizActive(false);
                setReviewIndex(0);
                setShowCurrentAnswer(false);
                setDragOffset({ x: 0, y: 0 });
              }}
              style={{
                padding: '10px 0',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#ffffff' : 'transparent',
                color: activeTab === tab.id ? '#0f172a' : '#64748b',
                fontWeight: activeTab === tab.id ? 700 : 600,
                fontSize: '11px',
                cursor: 'pointer',
                boxShadow: activeTab === tab.id ? '0 4px 6px -1px rgba(0, 0, 0, 0.05)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 🏷️ TAG FILTER BAR ── */}
        {(activeTab === 'review' || activeTab === 'practice') && !isQuizActive && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '12px',
              marginBottom: '12px',
            }}
          >
            <button
              onClick={() => {
                setSelectedTag('ALL');
                setReviewIndex(0);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: 'none',
                backgroundColor: selectedTag === 'ALL' ? '#0f172a' : '#ffffff',
                color: selectedTag === 'ALL' ? '#ffffff' : '#64748b',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                whiteSpace: 'nowrap',
              }}
            >
              すべて ({memos.length})
            </button>
            {allTags.map((t) => {
              const count = memos.filter((m) => m.tag === t).length;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setSelectedTag(t);
                    setReviewIndex(0);
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: selectedTag === t ? '#0f172a' : '#ffffff',
                    color: selectedTag === t ? '#ffffff' : '#64748b',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  #{t} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* ── TAB 1: 復習画面 ── */}
        {activeTab === 'review' && (
          <section>
            {filteredTodayTasks.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  backgroundColor: '#ffffff',
                  borderRadius: '20px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.03)',
                  border: '1px solid #f1f5f9',
                }}
              >
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>
                  🎉 すべての復習が完了しました！
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>コインを獲得しました。猫を育成しましょう！</div>
              </div>
            ) : (
              <div>
                {(() => {
                  const task = filteredTodayTasks[Math.min(reviewIndex, filteredTodayTasks.length - 1)];
                  if (!task) return null;

                  const cardStyle = getCardTransformStyle();

                  return (
                    <div
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerCancel={handlePointerCancel}
                      onPointerUp={(e) => handlePointerUp(e, 'review', task)}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '20px',
                        padding: '20px',
                        boxShadow: '0 10px 20px -5px rgba(0,0,0,0.05)',
                        border: '1px solid #f1f5f9',
                        userSelect: 'none',
                        touchAction: 'none',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        position: 'relative',
                        willChange: 'transform',
                        ...cardStyle,
                      }}
                    >
                      {dragOffset.x > 30 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 16,
                            left: 16,
                            border: '3px solid #10b981',
                            color: '#10b981',
                            fontWeight: 800,
                            fontSize: '14px',
                            padding: '4px 12px',
                            borderRadius: '8px',
                            transform: 'rotate(-15deg)',
                            zIndex: 20,
                          }}
                        >
                          覚えた 👉
                        </div>
                      )}
                      {dragOffset.x < -30 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            border: '3px solid #ef4444',
                            color: '#ef4444',
                            fontWeight: 800,
                            fontSize: '14px',
                            padding: '4px 12px',
                            borderRadius: '8px',
                            transform: 'rotate(15deg)',
                            zIndex: 20,
                          }}
                        >
                          👈 忘れた
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#10b981',
                            backgroundColor: '#ecfdf5',
                            padding: '4px 10px',
                            borderRadius: '12px',
                          }}
                        >
                          残り {filteredTodayTasks.length} 問 (STAGE {task.stage})
                        </span>
                        {task.memo.tag && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#059669',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              padding: '2px 8px',
                              borderRadius: '8px',
                            }}
                          >
                            #{task.memo.tag}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          backgroundColor: '#f8fafc',
                          borderRadius: '16px',
                          padding: '20px',
                          minHeight: '160px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          textAlign: 'center',
                          border: '1px dashed #cbd5e1',
                          marginBottom: '16px',
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: '1.5' }}>
                          {task.memo.title}
                        </div>

                        {task.memo.type === 'question' && task.memo.answer && (
                          <div style={{ marginTop: '16px', width: '100%' }}>
                            {showCurrentAnswer ? (
                              <div
                                style={{
                                  backgroundColor: '#ffffff',
                                  padding: '12px 16px',
                                  borderRadius: '12px',
                                  fontSize: '13px',
                                  color: '#10b981',
                                  fontWeight: 700,
                                  lineHeight: 1.6,
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                }}
                              >
                                {task.memo.answer}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                                👆 タップして回答を表示
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetReview(task);
                          }}
                          style={{
                            padding: '12px',
                            backgroundColor: '#fef2f2',
                            color: '#ef4444',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          👈 忘れた (左)
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompleteReview(task.schedule_id);
                          }}
                          style={{
                            padding: '12px',
                            backgroundColor: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                          }}
                        >
                          覚えた (右 👉)
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
        )}

        {/* ── TAB 2: 一覧画面 ── */}
        {activeTab === 'practice' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {isQuizActive ? (
              <div>
                {quizIndex < quizQueue.length ? (
                  (() => {
                    const currentMemo = quizQueue[quizIndex];
                    const cardStyle = getCardTransformStyle();

                    return (
                      <div
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerCancel={handlePointerCancel}
                        onPointerUp={(e) => handlePointerUp(e, 'quiz', currentMemo)}
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '20px',
                          padding: '20px',
                          boxShadow: '0 10px 20px -5px rgba(0,0,0,0.05)',
                          border: '1px solid #f1f5f9',
                          userSelect: 'none',
                          touchAction: 'none',
                          cursor: isDragging ? 'grabbing' : 'grab',
                          position: 'relative',
                          willChange: 'transform',
                          ...cardStyle,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#3b82f6',
                              backgroundColor: '#eff6ff',
                              padding: '4px 10px',
                              borderRadius: '12px',
                            }}
                          >
                            問題 {quizIndex + 1} / {quizQueue.length}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsQuizActive(false);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            ✕ 一覧に戻る
                          </button>
                        </div>

                        <div
                          style={{
                            backgroundColor: '#f8fafc',
                            borderRadius: '16px',
                            padding: '20px',
                            minHeight: '160px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            textAlign: 'center',
                            border: '1px dashed #cbd5e1',
                            marginBottom: '16px',
                            pointerEvents: 'none',
                          }}
                        >
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: '1.5' }}>
                            {currentMemo?.title}
                          </div>

                          {currentMemo?.type === 'question' && currentMemo?.answer && (
                            <div style={{ marginTop: '16px', width: '100%' }}>
                              {showCurrentAnswer ? (
                                <div
                                  style={{
                                    backgroundColor: '#ffffff',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    fontSize: '13px',
                                    color: '#3b82f6',
                                    fontWeight: 700,
                                    lineHeight: 1.6,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                  }}
                                >
                                  {currentMemo.answer}
                                </div>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                                  👆 タップして回答を表示
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuizForgot();
                            }}
                            style={{
                              padding: '12px',
                              backgroundColor: '#fef2f2',
                              color: '#ef4444',
                              border: 'none',
                              borderRadius: '12px',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            👈 忘れた (左)
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuizRemember();
                            }}
                            style={{
                              padding: '12px',
                              backgroundColor: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '12px',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer',
                              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                            }}
                          >
                            覚えた (右 👉)
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#ffffff',
                      borderRadius: '20px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.03)',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981', marginBottom: '8px' }}>
                      🎉 この条件の全問題を完了しました！
                    </div>
                    <button
                      onClick={() => setIsQuizActive(false)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        marginTop: '12px',
                      }}
                    >
                      一覧へ戻る
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={handleStartQuiz}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '16px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  🚀 {selectedTag === 'ALL' ? 'すべての問題' : `#${selectedTag}`} で復習を始める
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 メモを検索..."
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '14px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontSize: '12px',
                      outline: 'none',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    }}
                  />
                  <button
                    onClick={() => setIsShuffled(!isShuffled)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '14px',
                      backgroundColor: isShuffled ? '#10b981' : '#ffffff',
                      color: isShuffled ? '#ffffff' : '#475569',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      border: isShuffled ? 'none' : '1px solid #e2e8f0',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🔀 シャッフル
                  </button>
                </div>

                {filteredMemos.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '30px 20px',
                      backgroundColor: '#ffffff',
                      borderRadius: '16px',
                      color: '#94a3b8',
                      fontSize: '12px',
                    }}
                  >
                    該当するメモが見つかりません
                  </div>
                ) : (
                  filteredMemos.map((memo) => (
                    <div
                      key={memo.id}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '16px',
                        padding: '16px',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                        border: '1px solid #f1f5f9',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: memo.type === 'question' ? '#3b82f6' : '#64748b',
                            backgroundColor: memo.type === 'question' ? '#eff6ff' : '#f1f5f9',
                            padding: '2px 8px',
                            borderRadius: '8px',
                          }}
                        >
                          {memo.type === 'question' ? '問題' : 'メモ'}
                        </span>
                        {memo.tag && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#059669',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              padding: '2px 8px',
                              borderRadius: '8px',
                            }}
                          >
                            #{memo.tag}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{memo.title}</div>

                      {memo.type === 'question' && memo.answer && (
                        <div style={{ marginTop: '8px' }}>
                          {showAnswerPracticeMap[memo.id] ? (
                            <div
                              style={{
                                backgroundColor: '#f8fafc',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: '#475569',
                                marginTop: '6px',
                              }}
                            >
                              {memo.answer}
                            </div>
                          ) : (
                            <button
                              onClick={() => togglePracticeAnswer(memo.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#10b981',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: 0,
                                marginTop: '4px',
                              }}
                            >
                              答えを確認
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </section>
        )}

        {/* ── TAB 3: アナリティクス画面 ── */}
        {activeTab === 'analytics' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>記憶定着率</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                  {totalCompleted + totalReset === 0
                    ? '0.0%'
                    : `${((totalCompleted / (totalCompleted + totalReset)) * 100).toFixed(1)}%`}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>総獲得コイン</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                  🪙 {totalCompleted * 50} G
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '18px', borderRadius: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                過去7日間の学習ログ
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                {getPast7Days().map((dateStr) => {
                  const count = activityLog[dateStr] || 0;
                  const dayLabel = dateStr.slice(5);
                  return (
                    <div key={dateStr} style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          height: '36px',
                          backgroundColor: count > 0 ? '#10b981' : '#f1f5f9',
                          opacity: count > 0 ? Math.min(1, 0.4 + count * 0.2) : 1,
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: count > 0 ? '#ffffff' : '#94a3b8',
                        }}
                      >
                        {count}
                      </div>
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '4px' }}>{dayLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── TAB 4: 作成・管理画面 ── */}
        {activeTab === 'memos' && (
          <section>
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: '0 10px 20px -5px rgba(0,0,0,0.03)',
                border: '1px solid #f1f5f9',
              }}
            >
              <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: 0, marginBottom: '16px', color: '#0f172a' }}>
                新しいカードを作成
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setType('question')}
                  style={{
                    padding: '10px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: type === 'question' ? '#0f172a' : '#f1f5f9',
                    color: type === 'question' ? '#ffffff' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  問題タイプ
                </button>
                <button
                  type="button"
                  onClick={() => setType('simple')}
                  style={{
                    padding: '10px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: type === 'simple' ? '#0f172a' : '#f1f5f9',
                    color: type === 'simple' ? '#ffffff' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  シンプルメモ
                </button>
              </div>

              <form onSubmit={handleAddMemo} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                    タイトル / 問題文
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例: S3の耐久性は何ナイン？"
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '12px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {type === 'question' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                      解答
                    </label>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="例: 11ナイン (99.999999999%)"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '12px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#0f172a',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                    タグ（任意）
                  </label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="例: AWS, JAVA, 英語"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '12px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    padding: '14px',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                    marginTop: '4px',
                  }}
                >
                  カードを保存
                </button>
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {memos.map((memo) => (
                <div
                  key={memo.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{memo.title}</span>
                    {memo.tag && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: '#059669',
                          backgroundColor: '#ecfdf5',
                          padding: '2px 6px',
                          borderRadius: '6px',
                        }}
                      >
                        #{memo.tag}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteMemo(memo.id)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '10px',
                      backgroundColor: '#fef2f2',
                      color: '#ef4444',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── TAB 5: 目標設定画面 ── */}
        {activeTab === 'settings' && (
          <section>
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: '0 10px 20px -5px rgba(0,0,0,0.03)',
                border: '1px solid #f1f5f9',
              }}
            >
              <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: 0, marginBottom: '16px', color: '#0f172a' }}>
                目標と試験日の設定
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                    目標タイトル
                  </label>
                  <input
                    type="text"
                    value={targetTitle}
                    onChange={(e) => {
                      setTargetTitle(e.target.value);
                      localStorage.setItem('target_title', e.target.value);
                    }}
                    placeholder="例: AWS 12冠達成 / 資格試験"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '12px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                    目標日・試験日
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => {
                      setTargetDate(e.target.value);
                      localStorage.setItem('target_date', e.target.value);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '12px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    padding: '14px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#1e40af',
                    marginTop: '8px',
                  }}
                >
                  💡 復習を完了してコイン（🪙）を貯めると、猫の育成をよりリッチに進められるようになります！
                </div>
              </div>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}