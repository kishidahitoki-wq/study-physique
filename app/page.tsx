'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FORGETTING_STAGES, calculateRandomScheduleTime } from '@/lib/scheduler';
import dynamic from 'next/dynamic';

// 3Dコンポーネント（猫モデル等）をクライアント限定で動的読み込み
const PhysiqueModel = dynamic(() => import('@/components/PhysiqueModel'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#475569',
        fontSize: '11px',
        fontFamily: 'monospace',
        letterSpacing: '0.15em',
      }}
    >
      [ LOADING_CAT_MODEL... ]
    </div>
  ),
});

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
  { level: 1, name: 'KITTEN // LV.1', minLove: 0, status: 'HUNGRY' },
  { level: 2, name: 'CAT // LV.2', minLove: 100, status: 'SATISFIED' },
  { level: 3, name: 'CYBER_CAT // LV.3', minLove: 300, status: 'HAPPY' },
  { level: 4, name: 'LORD_CAT // LV.4', minLove: 600, status: 'PUMPED' },
  { level: 5, name: 'GOD_CAT // LV.MAX', minLove: 1000, status: 'DIVINE' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'review' | 'memos' | 'practice' | 'analytics'>('review');

  const [memos, setMemos] = useState<Memo[]>([]);
  const [todayTasks, setTodayTasks] = useState<ReviewTask[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('ALL');

  // アコーディオン開閉状態
  const [showAnswerReviewMap, setShowAnswerReviewMap] = useState<{ [key: string]: boolean }>({});
  const [showAnswerPracticeMap, setShowAnswerPracticeMap] = useState<{ [key: string]: boolean }>({});

  // フォーム用
  const [type, setType] = useState<'question' | 'simple'>('question');
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(true);

  // 🐱 猫の育成 & ゲーミフィケーションステート（ローカルストレージ）
  const [foodStock, setFoodStock] = useState<number>(0); // キャットフード在庫
  const [catLove, setCatLove] = useState<number>(0);     // 親密度（Expの代わり）
  const [streak, setStreak] = useState<number>(0);
  const [lastReviewDate, setLastReviewDate] = useState<string>('');
  const [totalCompleted, setTotalCompleted] = useState<number>(0);
  const [totalReset, setTotalReset] = useState<number>(0);
  const [activityLog, setActivityLog] = useState<{ [date: string]: number }>({});

  // アニメーション用演出エフェクト
  const [feedEffect, setFeedEffect] = useState<string | null>(null);

  // Push通知ステート
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<string>('INITIALIZING...');

  // 初回起動時データ取得 ＆ 猫ステート読み込み
  useEffect(() => {
    fetchData();

    const savedFood = localStorage.getItem('cat_food_stock');
    const savedLove = localStorage.getItem('cat_love');
    const savedStreak = localStorage.getItem('physique_streak');
    const savedLastDate = localStorage.getItem('physique_last_date');
    const savedCompleted = localStorage.getItem('physique_total_completed');
    const savedReset = localStorage.getItem('physique_total_reset');
    const savedLog = localStorage.getItem('physique_activity_log');

    if (savedFood) setFoodStock(parseInt(savedFood, 10));
    if (savedLove) setCatLove(parseInt(savedLove, 10));
    if (savedStreak) setStreak(parseInt(savedStreak, 10));
    if (savedLastDate) setLastReviewDate(savedLastDate);
    if (savedCompleted) setTotalCompleted(parseInt(savedCompleted, 10));
    if (savedReset) setTotalReset(parseInt(savedReset, 10));
    if (savedLog) setActivityLog(JSON.parse(savedLog));
  }, []);

  // 復習完了時のフード獲得 ＆ ストリーク処理
  const handleReviewReward = (isSuccess: boolean) => {
    const todayStr = new Date().toISOString().split('T')[0];

    if (isSuccess) {
      // 復習完了でキャットフード +1 獲得！
      const newFood = foodStock + 1;
      setFoodStock(newFood);
      localStorage.setItem('cat_food_stock', newFood.toString());

      const newComp = totalCompleted + 1;
      setTotalCompleted(newComp);
      localStorage.setItem('physique_total_completed', newComp.toString());
    } else {
      const newRes = totalReset + 1;
      setTotalReset(newRes);
      localStorage.setItem('physique_total_reset', newRes.toString());
    }

    // デイリーアクティビティログ更新
    const newLog = { ...activityLog, [todayStr]: (activityLog[todayStr] || 0) + 1 };
    setActivityLog(newLog);
    localStorage.setItem('physique_activity_log', JSON.stringify(newLog));

    // ストリーク更新
    if (lastReviewDate !== todayStr) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setLastReviewDate(todayStr);
      localStorage.setItem('physique_streak', newStreak.toString());
      localStorage.setItem('physique_last_date', todayStr);
    }
  };

  // 🐱 猫に餌をあげるアクション
  const handleFeedCat = () => {
    if (foodStock <= 0) {
      alert('キャットフードがありません！復習（REVIEW）を完了してフードを獲得してください 🐟');
      return;
    }

    const newFood = foodStock - 1;
    const newLove = catLove + 25; // 1回餌をあげると親密度+25

    setFoodStock(newFood);
    setCatLove(newLove);
    localStorage.setItem('cat_food_stock', newFood.toString());
    localStorage.setItem('cat_love', newLove.toString());

    // 演出表示
    setFeedEffect('OM_NOM_NOM! 🐟 (+25 LOVE)');
    setTimeout(() => setFeedEffect(null), 2500);
  };

  // 現在の猫レベル算出
  const getCurrentCatStage = () => {
    let current = CAT_STAGES[0];
    for (const stage of CAT_STAGES) {
      if (catLove >= stage.minLove) current = stage;
    }
    return current;
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

    if (error) {
      console.error('データ取得エラー:', error);
    } else if (data) {
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

    if (error) {
      console.error('復習タスク取得エラー:', error);
    } else if (data) {
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
          setStatus('READY');
          const existingSub = await reg.pushManager.getSubscription();
          if (existingSub) {
            setSubscription(existingSub);
            setStatus('PUSH ENABLED');
          }
        })
        .catch((err) => setStatus('SW ERROR: ' + err.message));
    } else {
      setStatus('UNSUPPORTED (iOS NEEDS PWA)');
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
      alert('保存に失敗しました: ' + error.message);
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

      const { error: scheduleError } = await supabase
        .from('schedules')
        .insert(scheduleInserts);

      if (scheduleError) {
        console.error('スケジュールの登録に失敗しました:', scheduleError);
      }

      if (subscription) {
        const pushTitle =
          newMemo.type === 'question' ? `【猫が空腹です】${newMemo.title}` : `【メモ】${newMemo.title}`;
        const pushBody =
          newMemo.type === 'question' ? `復習を完了してキャットフードを獲得しよう！` : newMemo.title;

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
          }).catch((err) => console.error('QStash予約エラー:', err));
        }
      }

      setMemos([newMemo, ...memos]);
      setTitle('');
      setAnswer('');
      setTag('');
      fetchTodayTasks();
      alert('カードを作成し、猫の通知予約を完了しました！');
    }
  };

  // 復習完了（キャットフード獲得！）
  const handleCompleteReview = async (scheduleId: string) => {
    const { error } = await supabase
      .from('schedules')
      .update({ completed: true })
      .eq('id', scheduleId);

    if (error) {
      alert('更新に失敗しました: ' + error.message);
    } else {
      setTodayTasks(todayTasks.filter((task) => task.schedule_id !== scheduleId));
      handleReviewReward(true);
    }
  };

  // 復習リセット
  const handleResetReview = async (task: ReviewTask) => {
    const { error } = await supabase
      .from('schedules')
      .update({
        stage: 1,
        scheduled_at: new Date().toISOString(),
        completed: false,
      })
      .eq('id', task.schedule_id);

    if (error) {
      alert('更新に失敗しました: ' + error.message);
    } else {
      alert('忘却ステージを Stage 1 にリセットしました！');
      handleReviewReward(false);
      fetchTodayTasks();
    }
  };

  const toggleReviewAnswer = (scheduleId: string) => {
    setShowAnswerReviewMap((prev) => ({
      ...prev,
      [scheduleId]: !prev[scheduleId],
    }));
  };

  const togglePracticeAnswer = (memoId: string) => {
    setShowAnswerPracticeMap((prev) => ({
      ...prev,
      [memoId]: !prev[memoId],
    }));
  };

  const handleDeleteMemo = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;

    const { error } = await supabase.from('memos').delete().eq('id', id);
    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else {
      setMemos(memos.filter((memo) => memo.id !== id));
      setTodayTasks(todayTasks.filter((task) => task.memo.id !== id));
    }
  };

  const handleSubscribe = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('通知が拒否されました');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });

      setSubscription(sub);
      setStatus('PUSH ENABLED');
    } catch (err: any) {
      alert('エラー: ' + err.message);
    }
  };

  // 全タグのリスト
  const allTags = Array.from(
    new Set(
      memos
        .map((m) => m.tag)
        .filter((t): t is string => Boolean(t))
    )
  );

  // フィルタリング後のリスト
  const filteredMemos = selectedTag === 'ALL' ? memos : memos.filter((m) => m.tag === selectedTag);
  const filteredTodayTasks =
    selectedTag === 'ALL' ? todayTasks : todayTasks.filter((t) => t.memo.tag === selectedTag);

  const currentCatStage = getCurrentCatStage();

  // 過去7日間の日付配列生成 (アナリティクス用)
  const getPast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  };

  return (
    <div
      style={{
        backgroundColor: '#0a0a0a',
        color: '#e2e8f0',
        minHeight: '100vh',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        padding: '24px 16px 80px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── HEADER ── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          backgroundColor: 'rgba(10, 10, 10, 0.85)',
          borderBottom: '1px solid #262626',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '540px',
          margin: '0 auto 20px auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              backgroundColor: status === 'PUSH ENABLED' ? '#00f2fe' : '#ef4444',
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.15em',
              color: '#ffffff',
            }}
          >
            CYBER_CAT // V2.0
          </span>
        </div>

        <div>
          {!subscription ? (
            <button
              onClick={handleSubscribe}
              style={{
                backgroundColor: '#171717',
                color: '#00f2fe',
                border: '1px solid #00f2fe',
                padding: '6px 12px',
                borderRadius: '2px',
                fontWeight: 700,
                fontSize: '10px',
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              [ ENABLE_PUSH ]
            </button>
          ) : (
            <span
              style={{
                fontSize: '9px',
                color: '#00f2fe',
                letterSpacing: '0.1em',
                border: '1px solid #262626',
                padding: '3px 8px',
                borderRadius: '2px',
              }}
            >
              SYS_ACTIVE
            </span>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ maxWidth: '540px', margin: '0 auto' }}>
        {/* ── 🐱 CAT OBSERVATION & FEEDING STATION ── */}
        <div
          style={{
            backgroundColor: '#121212',
            border: '1px solid #262626',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '20px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              fontSize: '9px',
              color: '#525252',
              letterSpacing: '0.1em',
            }}
          >
            [ CAT_MONITOR ]
          </div>

          {/* 猫モデルビュー（既存の PhysiqueModel をそのまま流用または猫用コンポーネントに差し替え） */}
          <PhysiqueModel xp={catLove} />

          {/* 餌やりポップアップ演出 */}
          {feedEffect && (
            <div
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#00f2fe',
                color: '#0a0a0a',
                padding: '8px 16px',
                fontWeight: 700,
                fontSize: '12px',
                borderRadius: '2px',
                letterSpacing: '0.1em',
                boxShadow: '0 0 20px rgba(0, 242, 254, 0.6)',
                zIndex: 10,
              }}
            >
              {feedEffect}
            </div>
          )}

          {/* Status Monitor & Feed Action */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              paddingTop: '12px',
              borderTop: '1px solid #1f1f1f',
              marginTop: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '9px', color: '#666666', letterSpacing: '0.1em', marginBottom: '2px' }}>
                CAT_STAGE
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#00f2fe', letterSpacing: '0.05em' }}>
                {currentCatStage.name}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: '#666666', letterSpacing: '0.1em', marginBottom: '2px' }}>
                FOOD_STOCK
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: foodStock > 0 ? '#10b981' : '#ef4444', letterSpacing: '0.05em' }}>
                🐟 {foodStock} CANS
              </div>
            </div>
          </div>

          {/* 餌やり実行ボタン */}
          <button
            onClick={handleFeedCat}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '10px',
              backgroundColor: foodStock > 0 ? '#171717' : '#0a0a0a',
              color: foodStock > 0 ? '#00f2fe' : '#525252',
              border: foodStock > 0 ? '1px solid #00f2fe' : '1px solid #262626',
              borderRadius: '2px',
              fontWeight: 700,
              fontSize: '11px',
              fontFamily: 'inherit',
              cursor: foodStock > 0 ? 'pointer' : 'not-allowed',
              letterSpacing: '0.1em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>[ 🍽️ FEED_CAT (-1 CAN) ]</span>
          </button>

          {/* LOVE Gauge Bar */}
          <div style={{ marginTop: '12px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '9px',
                color: '#525252',
                marginBottom: '4px',
                letterSpacing: '0.08em',
              }}
            >
              <span>LOVE: {catLove} / 1000</span>
              <span>{Math.floor((catLove / 1000) * 100)}%</span>
            </div>
            <div style={{ width: '100%', height: '3px', backgroundColor: '#1a1a1a' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (catLove / 1000) * 100)}%`,
                  backgroundColor: '#00f2fe',
                  transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── 🗂️ TAB NAVIGATION ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: '4px',
            backgroundColor: '#121212',
            padding: '4px',
            border: '1px solid #262626',
            borderRadius: '4px',
            marginBottom: '16px',
          }}
        >
          <button
            onClick={() => setActiveTab('review')}
            style={{
              padding: '10px 2px',
              borderRadius: '2px',
              border: 'none',
              backgroundColor: activeTab === 'review' ? '#262626' : 'transparent',
              color: activeTab === 'review' ? '#00f2fe' : '#737373',
              fontWeight: 700,
              fontSize: '10px',
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            REVIEW({todayTasks.length})
          </button>

          <button
            onClick={() => setActiveTab('practice')}
            style={{
              padding: '10px 2px',
              borderRadius: '2px',
              border: 'none',
              backgroundColor: activeTab === 'practice' ? '#262626' : 'transparent',
              color: activeTab === 'practice' ? '#00f2fe' : '#737373',
              fontWeight: 700,
              fontSize: '10px',
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            ALL_MEMO
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            style={{
              padding: '10px 2px',
              borderRadius: '2px',
              border: 'none',
              backgroundColor: activeTab === 'analytics' ? '#262626' : 'transparent',
              color: activeTab === 'analytics' ? '#00f2fe' : '#737373',
              fontWeight: 700,
              fontSize: '10px',
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            STATS
          </button>

          <button
            onClick={() => setActiveTab('memos')}
            style={{
              padding: '10px 2px',
              borderRadius: '2px',
              border: 'none',
              backgroundColor: activeTab === 'memos' ? '#262626' : 'transparent',
              color: activeTab === 'memos' ? '#00f2fe' : '#737373',
              fontWeight: 700,
              fontSize: '10px',
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            EDITOR
          </button>
        </div>

        {/* ── 🏷️ TAG FILTER BAR ── */}
        {(activeTab === 'review' || activeTab === 'practice') && allTags.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '12px',
              marginBottom: '12px',
            }}
          >
            <button
              onClick={() => setSelectedTag('ALL')}
              style={{
                padding: '4px 10px',
                borderRadius: '2px',
                border: selectedTag === 'ALL' ? '1px solid #00f2fe' : '1px solid #262626',
                backgroundColor: selectedTag === 'ALL' ? '#171717' : '#0a0a0a',
                color: selectedTag === 'ALL' ? '#00f2fe' : '#737373',
                fontSize: '9px',
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              # ALL ({memos.length})
            </button>
            {allTags.map((t) => {
              const count = memos.filter((m) => m.tag === t).length;
              return (
                <button
                  key={t}
                  onClick={() => setSelectedTag(t)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '2px',
                    border: selectedTag === t ? '1px solid #00f2fe' : '1px solid #262626',
                    backgroundColor: selectedTag === t ? '#171717' : '#0a0a0a',
                    color: selectedTag === t ? '#00f2fe' : '#737373',
                    fontSize: '9px',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  #{t} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: 🔥 今日の復習画面 */}
        {/* ========================================================= */}
        {activeTab === 'review' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '12px', fontWeight: 700, margin: 0, color: '#00f2fe', letterSpacing: '0.1em' }}>
                  // SCHEDULED_TASKS
                </h2>
              </div>
              <span style={{ fontSize: '10px', color: '#737373', border: '1px solid #262626', padding: '2px 8px', borderRadius: '2px' }}>
                {filteredTodayTasks.length} PENDING
              </span>
            </div>

            {filteredTodayTasks.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 16px',
                  backgroundColor: '#121212',
                  border: '1px dashed #262626',
                  borderRadius: '4px',
                  color: '#737373',
                }}
              >
                <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, marginBottom: '6px', letterSpacing: '0.1em' }}>
                  [ STATUS: ALL_CLEAR ]
                </div>
                <div style={{ fontSize: '11px' }}>本日の復習完了！フードを獲得しました 🐟</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredTodayTasks.map((task) => (
                  <div
                    key={task.schedule_id}
                    style={{
                      backgroundColor: '#121212',
                      border: '1px solid #262626',
                      borderRadius: '4px',
                      padding: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#00f2fe', border: '1px solid #1a3a4a', padding: '2px 6px', borderRadius: '2px', letterSpacing: '0.05em' }}>
                          STAGE 0{task.stage} / 05
                        </span>
                        {task.memo.tag && (
                          <span style={{ fontSize: '8px', color: '#a3a3a3', backgroundColor: '#171717', border: '1px solid #262626', padding: '2px 6px', borderRadius: '2px' }}>
                            #{task.memo.tag}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '9px', color: '#525252', letterSpacing: '0.05em' }}>
                        {task.memo.type === 'question' ? 'TYPE: QUESTION' : 'TYPE: SIMPLE_MEMO'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '13px', fontWeight: 400, margin: '0 0 14px 0', color: '#e5e5e5', lineHeight: '1.5' }}>
                      {task.memo.title}
                    </h3>

                    {task.memo.type === 'question' && task.memo.answer && (
                      <div style={{ marginBottom: '14px' }}>
                        {showAnswerReviewMap[task.schedule_id] ? (
                          <div
                            style={{
                              backgroundColor: '#0a0a0a',
                              borderLeft: '2px solid #00f2fe',
                              padding: '10px 12px',
                              fontSize: '11px',
                              color: '#d4d4d4',
                              lineHeight: 1.5,
                            }}
                          >
                            {task.memo.answer}
                          </div>
                        ) : (
                          <button
                            onClick={() => toggleReviewAnswer(task.schedule_id)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              backgroundColor: '#171717',
                              border: '1px solid #262626',
                              borderRadius: '2px',
                              color: '#737373',
                              fontSize: '10px',
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                              letterSpacing: '0.05em',
                            }}
                          >
                            [ SHOW_ANSWER ]
                          </button>
                        )}
                      </div>
                    )}

                    {/* 2択フィードバックボタン */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        onClick={() => handleResetReview(task)}
                        style={{
                          padding: '10px',
                          backgroundColor: '#2a0a0a',
                          color: '#f87171',
                          border: '1px solid #ef4444',
                          borderRadius: '2px',
                          fontWeight: 700,
                          fontSize: '10px',
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          letterSpacing: '0.05em',
                        }}
                      >
                        RESET (STAGE 1)
                      </button>

                      <button
                        onClick={() => handleCompleteReview(task.schedule_id)}
                        style={{
                          padding: '10px',
                          backgroundColor: '#00f2fe',
                          color: '#0a0a0a',
                          border: '1px solid #00f2fe',
                          borderRadius: '2px',
                          fontWeight: 700,
                          fontSize: '10px',
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          letterSpacing: '0.05em',
                        }}
                      >
                        COMPLETE (+1 🐟)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 2: 🧠 全メモ自主復習画面 */}
        {/* ========================================================= */}
        {activeTab === 'practice' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '12px', fontWeight: 700, margin: 0, color: '#e5e5e5', letterSpacing: '0.1em' }}>
                  // ALL_PRACTICE_ARCHIVE
                </h2>
              </div>
              <span style={{ fontSize: '10px', color: '#737373', border: '1px solid #262626', padding: '2px 8px', borderRadius: '2px' }}>
                {filteredMemos.length} ITEMS
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#525252', fontSize: '11px' }}>
                [ LOADING_DATA... ]
              </div>
            ) : filteredMemos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed #262626', borderRadius: '4px', color: '#525252', fontSize: '11px' }}>
                データが存在しません。[ EDITOR ] タブから作成してください。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredMemos.map((memo) => (
                  <div
                    key={memo.id}
                    style={{
                      backgroundColor: '#121212',
                      border: '1px solid #262626',
                      borderRadius: '4px',
                      padding: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '8px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '2px',
                            border: '1px solid #262626',
                            color: memo.type === 'question' ? '#00f2fe' : '#737373',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {memo.type === 'question' ? 'QUESTION' : 'SIMPLE_MEMO'}
                        </span>
                        {memo.tag && (
                          <span style={{ fontSize: '8px', color: '#a3a3a3', backgroundColor: '#171717', border: '1px solid #262626', padding: '2px 6px', borderRadius: '2px' }}>
                            #{memo.tag}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 400, color: '#d4d4d4', lineHeight: '1.5' }}>
                      {memo.title}
                    </h3>

                    {memo.type === 'question' && memo.answer && (
                      <div>
                        {showAnswerPracticeMap[memo.id] ? (
                          <div
                            style={{
                              backgroundColor: '#0a0a0a',
                              padding: '10px 12px',
                              borderRadius: '2px',
                              fontSize: '11px',
                              color: '#a3a3a3',
                              borderLeft: '2px solid #00f2fe',
                              lineHeight: 1.5,
                              marginTop: '6px',
                            }}
                          >
                            {memo.answer}
                            <button
                              onClick={() => togglePracticeAnswer(memo.id)}
                              style={{
                                display: 'block',
                                marginTop: '6px',
                                background: 'transparent',
                                border: 'none',
                                color: '#525252',
                                fontSize: '9px',
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              ▲ [ HIDE_ANSWER ]
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => togglePracticeAnswer(memo.id)}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              backgroundColor: '#171717',
                              border: '1px solid #262626',
                              borderRadius: '2px',
                              color: '#00f2fe',
                              fontSize: '10px',
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                              letterSpacing: '0.05em',
                            }}
                          >
                            [ CHECK_ANSWER ]
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 3: 📊 パフォーマンステキスト・アナリティクス画面 */}
        {/* ========================================================= */}
        {activeTab === 'analytics' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, margin: 0, color: '#00f2fe', letterSpacing: '0.1em' }}>
                // PERFORMANCE_ANALYTICS
              </h2>
              <span style={{ fontSize: '9px', color: '#525252' }}>REALTIME_METRICS</span>
            </div>

            {/* KPI Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ backgroundColor: '#121212', border: '1px solid #262626', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontSize: '9px', color: '#737373', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  RETENTION_RATE
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#00f2fe' }}>
                  {totalCompleted + totalReset === 0
                    ? '0.0%'
                    : `${((totalCompleted / (totalCompleted + totalReset)) * 100).toFixed(1)}%`}
                </div>
                <div style={{ fontSize: '8px', color: '#525252', marginTop: '4px' }}>
                  OK: {totalCompleted} / RESET: {totalReset}
                </div>
              </div>

              <div style={{ backgroundColor: '#121212', border: '1px solid #262626', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontSize: '9px', color: '#737373', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  FOOD_ACQUIRED
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
                  🐟 {totalCompleted}
                </div>
                <div style={{ fontSize: '8px', color: '#525252', marginTop: '4px' }}>
                  TOTAL_CANS_EARNED
                </div>
              </div>
            </div>

            {/* 7日間のアクティビティログ */}
            <div style={{ backgroundColor: '#121212', border: '1px solid #262626', padding: '14px', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#e5e5e5', letterSpacing: '0.08em', marginBottom: '12px' }}>
                WEEKLY_FEEDING_LOG (PAST 7 DAYS)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                {getPast7Days().map((dateStr) => {
                  const count = activityLog[dateStr] || 0;
                  const dayLabel = dateStr.slice(5); // MM-DD
                  const isToday = new Date().toISOString().split('T')[0] === dateStr;

                  return (
                    <div key={dateStr} style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          height: '32px',
                          backgroundColor: count > 0 ? '#00f2fe' : '#1a1a1a',
                          opacity: count > 0 ? Math.min(1, 0.3 + count * 0.2) : 1,
                          border: isToday ? '1px solid #ffffff' : '1px solid #262626',
                          borderRadius: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: count > 0 ? '#0a0a0a' : '#525252',
                        }}
                      >
                        {count}
                      </div>
                      <div style={{ fontSize: '8px', color: '#525252', marginTop: '4px' }}>{dayLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 4: ✏️ メモ作成 ＆ 編集・管理画面 */}
        {/* ========================================================= */}
        {activeTab === 'memos' && (
          <section>
            <div
              style={{
                backgroundColor: '#121212',
                border: '1px solid #262626',
                borderRadius: '4px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ fontSize: '11px', fontWeight: 700, marginTop: 0, marginBottom: '14px', color: '#00f2fe', letterSpacing: '0.1em' }}>
                // CREATE_NEW_CARD
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setType('question')}
                  style={{
                    padding: '8px',
                    borderRadius: '2px',
                    border: type === 'question' ? '1px solid #00f2fe' : '1px solid #262626',
                    backgroundColor: type === 'question' ? '#171717' : '#0a0a0a',
                    color: type === 'question' ? '#00f2fe' : '#737373',
                    fontWeight: 700,
                    fontSize: '10px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    letterSpacing: '0.05em',
                  }}
                >
                  QUESTION_TYPE
                </button>
                <button
                  type="button"
                  onClick={() => setType('simple')}
                  style={{
                    padding: '8px',
                    borderRadius: '2px',
                    border: type === 'simple' ? '1px solid #00f2fe' : '1px solid #262626',
                    backgroundColor: type === 'simple' ? '#171717' : '#0a0a0a',
                    color: type === 'simple' ? '#00f2fe' : '#737373',
                    fontWeight: 700,
                    fontSize: '10px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    letterSpacing: '0.05em',
                  }}
                >
                  SIMPLE_MEMO
                </button>
              </div>

              <form onSubmit={handleAddMemo} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '9px', color: '#666666', fontWeight: 700, marginBottom: '4px', letterSpacing: '0.08em' }}>
                    {type === 'question' ? 'QUESTION_TEXT' : 'MEMO_TITLE'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={type === 'question' ? 'e.g. AWS S3の耐久性は何ナイン？' : 'e.g. 今日のメモ'}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '2px',
                      backgroundColor: '#0a0a0a',
                      border: '1px solid #262626',
                      color: '#fff',
                      fontSize: '11px',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {type === 'question' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '9px', color: '#666666', fontWeight: 700, marginBottom: '4px', letterSpacing: '0.08em' }}>
                      ANSWER_TEXT
                    </label>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="e.g. 11ナイン (99.999999999%)"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '2px',
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #262626',
                        color: '#fff',
                        fontSize: '11px',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '9px', color: '#666666', fontWeight: 700, marginBottom: '4px', letterSpacing: '0.08em' }}>
                    TAG (CATEGORY)
                  </label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="e.g. AWS, WORK, FITNESS (任意)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '2px',
                      backgroundColor: '#0a0a0a',
                      border: '1px solid #262626',
                      color: '#fff',
                      fontSize: '11px',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    padding: '10px',
                    backgroundColor: '#00f2fe',
                    color: '#0a0a0a',
                    border: '1px solid #00f2fe',
                    borderRadius: '2px',
                    fontWeight: 700,
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    marginTop: '4px',
                    letterSpacing: '0.08em',
                  }}
                >
                  SAVE & SCHEDULE_PUSH
                </button>
              </form>
            </div>

            <div>
              <h3 style={{ fontSize: '11px', fontWeight: 700, marginBottom: '12px', color: '#737373', letterSpacing: '0.08em' }}>
                // CARD_MANAGEMENT
              </h3>

              {memos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#525252', fontSize: '11px' }}>
                  登録データが存在しません
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {memos.map((memo) => (
                    <div
                      key={memo.id}
                      style={{
                        backgroundColor: '#121212',
                        border: '1px solid #262626',
                        borderRadius: '4px',
                        padding: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '9px', color: '#525252' }}>
                            {new Date(memo.created_at).toLocaleDateString('ja-JP')}
                          </span>
                          {memo.tag && (
                            <span style={{ fontSize: '8px', color: '#a3a3a3', backgroundColor: '#171717', border: '1px solid #262626', padding: '1px 5px', borderRadius: '2px' }}>
                              #{memo.tag}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleDeleteMemo(memo.id)}
                            style={{
                              padding: '2px 6px',
                              fontSize: '9px',
                              backgroundColor: 'transparent',
                              color: '#ef4444',
                              border: '1px solid #331010',
                              borderRadius: '2px',
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            DEL
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '12px', fontWeight: 400, color: '#e5e5e5' }}>{memo.title}</div>
                      {memo.answer && (
                        <div style={{ fontSize: '11px', color: '#737373', marginTop: '4px' }}>{memo.answer}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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