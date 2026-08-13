'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FORGETTING_STAGES, calculateRandomScheduleTime } from '@/lib/scheduler';

type Memo = {
  id: string;
  type: 'question' | 'simple';
  title: string;
  answer?: string;
  created_at: string;
};

type ReviewTask = {
  schedule_id: string;
  stage: number;
  memo: Memo;
};

export default function Home() {
  // タブ管理 ('review' | 'memos' | 'practice')
  const [activeTab, setActiveTab] = useState<'review' | 'memos' | 'practice'>('review');

  const [memos, setMemos] = useState<Memo[]>([]);
  const [todayTasks, setTodayTasks] = useState<ReviewTask[]>([]);
  
  // アコーディオン開閉状態の管理
  const [showAnswerReviewMap, setShowAnswerReviewMap] = useState<{ [key: string]: boolean }>({});
  const [showAnswerPracticeMap, setShowAnswerPracticeMap] = useState<{ [key: string]: boolean }>({});

  // フォーム用ステート
  const [type, setType] = useState<'question' | 'simple'>('question');
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);

  // Push通知ステート
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<string>('INITIALIZING...');

  // 初回起動時データ取得
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchMemos(), fetchTodayTasks()]);
    setLoading(false);
  };

  // 全メモ取得
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

  // 今日の復習タスク取得（重複排除・最新の1枚のみ）
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

  // Service Worker & Push 初期化
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(async (reg) => {
        setStatus('READY');
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          setSubscription(existingSub);
          setStatus('PUSH ENABLED');
        }
      }).catch(err => setStatus('SW ERROR: ' + err.message));
    } else {
      setStatus('UNSUPPORTED (iOS NEEDS PWA)');
    }
  }, []);

  // メモ追加 ＆ スケジュール＋QStash予約
  const handleAddMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const { data, error } = await supabase
      .from('memos')
      .insert([{ type, title, answer: type === 'question' ? answer : null }])
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
        const pushTitle = newMemo.type === 'question' ? `【復習タイム】${newMemo.title}` : `【メモ】${newMemo.title}`;
        const pushBody = newMemo.type === 'question' ? `正解を確認して筋肉をパンプさせよう！` : newMemo.title;

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
          }).catch(err => console.error('QStash予約エラー:', err));
        }
      }

      setMemos([newMemo, ...memos]);
      setTitle('');
      setAnswer('');
      fetchTodayTasks();
      alert('カードを作成し、忘却曲線の通知予約を完了しました！');
    }
  };

  // 復習完了処理
  const handleCompleteReview = async (scheduleId: string) => {
    const { error } = await supabase
      .from('schedules')
      .update({ completed: true })
      .eq('id', scheduleId);

    if (error) {
      alert('更新に失敗しました: ' + error.message);
    } else {
      setTodayTasks(todayTasks.filter(task => task.schedule_id !== scheduleId));
    }
  };

  // 解答トグル（復習画面用）
  const toggleReviewAnswer = (scheduleId: string) => {
    setShowAnswerReviewMap(prev => ({
      ...prev,
      [scheduleId]: !prev[scheduleId],
    }));
  };

  // 解答トグル（自主復習画面用）
  const togglePracticeAnswer = (memoId: string) => {
    setShowAnswerPracticeMap(prev => ({
      ...prev,
      [memoId]: !prev[memoId],
    }));
  };

  // メモ削除
  const handleDeleteMemo = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;

    const { error } = await supabase.from('memos').delete().eq('id', id);
    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else {
      setMemos(memos.filter(memo => memo.id !== id));
      setTodayTasks(todayTasks.filter(task => task.memo.id !== id));
    }
  };

  // 通知許可
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
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)
      });

      setSubscription(sub);
      setStatus('PUSH ENABLED');
    } catch (err: any) {
      alert('エラー: ' + err.message);
    }
  };

  // 10秒後テスト通知
  const handleSchedulePush = async (memo: Memo) => {
    if (!subscription) {
      alert('先に画面上部の「NOTIFICATION ENABLE」を押してください');
      return;
    }

    const pushTitle = memo.type === 'question' ? `【復習】${memo.title}` : `【メモ】${memo.title}`;
    const pushBody = memo.type === 'question' ? `答え：${memo.answer || 'なし'}` : memo.title;

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        title: pushTitle,
        body: pushBody,
        delaySeconds: 10
      })
    });

    if (res.ok) {
      alert(`「${memo.title}」を10秒後に予約しました！`);
    } else {
      alert('予約に失敗しました');
    }
  };

  return (
    <div style={{ backgroundColor: '#090d16', color: '#f3f4f6', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(12px)',
        backgroundColor: 'rgba(9, 13, 22, 0.8)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: status === 'PUSH ENABLED' ? '#00f2fe' : '#e11d48', boxShadow: status === 'PUSH ENABLED' ? '0 0 10px #00f2fe' : 'none' }}></div>
          <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '0.05em', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            PHYSIQUE STUDY
          </span>
        </div>

        <div>
          {!subscription ? (
            <button
              onClick={handleSubscribe}
              style={{
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                color: '#090d16',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '20px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: '0 0 15px rgba(0, 242, 254, 0.4)'
              }}
            >
              NOTIFICATION ENABLE
            </button>
          ) : (
            <span style={{ fontSize: '11px', color: '#00f2fe', letterSpacing: '0.1em', fontWeight: 600, border: '1px solid rgba(0,242,254,0.3)', padding: '4px 10px', borderRadius: '12px' }}>
              ONLINE / ACTIVE
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px 80px 16px' }}>

        {/* 🗂️ タブナビゲーション */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '6px',
          background: 'rgba(17, 24, 39, 0.7)',
          padding: '6px',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '28px',
          backdropFilter: 'blur(12px)'
        }}>
          <button
            onClick={() => setActiveTab('review')}
            style={{
              padding: '10px 4px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === 'review' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'transparent',
              color: activeTab === 'review' ? '#090d16' : '#9ca3af',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'review' ? '0 4px 15px rgba(0, 242, 254, 0.3)' : 'none'
            }}
          >
            🔥 復習 ({todayTasks.length})
          </button>

          <button
            onClick={() => setActiveTab('practice')}
            style={{
              padding: '10px 4px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === 'practice' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'transparent',
              color: activeTab === 'practice' ? '#090d16' : '#9ca3af',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'practice' ? '0 4px 15px rgba(0, 242, 254, 0.3)' : 'none'
            }}
          >
            🧠 全メモ復習
          </button>

          <button
            onClick={() => setActiveTab('memos')}
            style={{
              padding: '10px 4px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === 'memos' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'transparent',
              color: activeTab === 'memos' ? '#090d16' : '#9ca3af',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'memos' ? '0 4px 15px rgba(0, 242, 254, 0.3)' : 'none'
            }}
          >
            ✏️ 作成・編集
          </button>
        </div>


        {/* ========================================================= */}
        {/* TAB 1: 🔥 今日の復習画面 (エビングハウスの忘却曲線に基づく) */}
        {/* ========================================================= */}
        {activeTab === 'review' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#00f2fe' }}>
                  TODAY'S REVIEW
                </h2>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  忘却曲線のタイミングが到来した復習カード
                </p>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#00f2fe', background: 'rgba(0, 242, 254, 0.1)', border: '1px solid rgba(0, 242, 254, 0.3)', padding: '4px 12px', borderRadius: '12px' }}>
                {todayTasks.length} TASKS
              </span>
            </div>

            {todayTasks.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px 16px',
                background: 'rgba(0, 242, 254, 0.03)',
                border: '1px dashed rgba(0, 242, 254, 0.2)',
                borderRadius: '20px',
                color: '#9ca3af'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎉</div>
                <div style={{ fontWeight: 700, color: '#f3f4f6', marginBottom: '4px' }}>復習完了！</div>
                <div style={{ fontSize: '13px' }}>現在、復習が必要なカードはありません。完璧です！</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {todayTasks.map((task) => (
                  <div
                    key={task.schedule_id}
                    style={{
                      background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(10, 15, 30, 0.9) 100%)',
                      border: '1px solid rgba(0, 242, 254, 0.3)',
                      borderRadius: '20px',
                      padding: '20px',
                      boxShadow: '0 10px 30px rgba(0, 242, 254, 0.08)',
                      backdropFilter: 'blur(12px)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#00f2fe', background: 'rgba(0, 242, 254, 0.15)', padding: '4px 10px', borderRadius: '8px' }}>
                        STAGE {task.stage} / 5
                      </span>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>
                        {task.memo.type === 'question' ? '❓ クイズ' : '📝 メモ'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0', color: '#ffffff' }}>
                      {task.memo.title}
                    </h3>

                    {task.memo.type === 'question' && task.memo.answer && (
                      <div style={{ marginBottom: '16px' }}>
                        {showAnswerReviewMap[task.schedule_id] ? (
                          <div style={{
                            background: 'rgba(0, 242, 254, 0.06)',
                            borderLeft: '3px solid #00f2fe',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            color: '#e5e7eb',
                            lineHeight: 1.5
                          }}>
                            {task.memo.answer}
                          </div>
                        ) : (
                          <button
                            onClick={() => toggleReviewAnswer(task.schedule_id)}
                            style={{
                              width: '100%',
                              padding: '10px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px dashed rgba(255, 255, 255, 0.15)',
                              borderRadius: '10px',
                              color: '#9ca3af',
                              fontSize: '13px',
                              cursor: 'pointer'
                            }}
                          >
                            👁️ 答えを見る
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => handleCompleteReview(task.schedule_id)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                        color: '#090d16',
                        border: 'none',
                        borderRadius: '12px',
                        fontWeight: 800,
                        fontSize: '14px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(0, 242, 254, 0.3)'
                      }}
                    >
                      ✨ 覚えた！（復習完了）
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}


        {/* ========================================================= */}
        {/* TAB 2: 🧠 全メモ自主復習画面 (忘却曲線に関係なくいつでも復習) */}
        {/* ========================================================= */}
        {activeTab === 'practice' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#f3f4f6' }}>
                  ALL PRACTICE
                </h2>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  いつでも自由に行える自主トレーニング
                </p>
              </div>
              <span style={{ fontSize: '12px', color: '#6b7280', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '10px' }}>
                {memos.length} CARDS
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>読み込み中...</div>
            ) : memos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', color: '#4b5563' }}>
                カードがありません。「作成・編集」タブから作ってみましょう！
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {memos.map((memo) => (
                  <div
                    key={memo.id}
                    style={{
                      background: 'rgba(17, 24, 39, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '18px',
                      backdropFilter: 'blur(8px)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: memo.type === 'question' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                        color: memo.type === 'question' ? '#00f2fe' : '#9ca3af'
                      }}>
                        {memo.type === 'question' ? 'QUESTION' : 'MEMO'}
                      </span>
                    </div>

                    <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>
                      {memo.title}
                    </h3>

                    {memo.type === 'question' && memo.answer && (
                      <div>
                        {showAnswerPracticeMap[memo.id] ? (
                          <div style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '12px 14px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: '#e5e7eb',
                            borderLeft: '2px solid #00f2fe',
                            lineHeight: 1.5,
                            marginTop: '8px'
                          }}>
                            {memo.answer}
                            <button
                              onClick={() => togglePracticeAnswer(memo.id)}
                              style={{
                                display: 'block',
                                marginTop: '8px',
                                background: 'transparent',
                                border: 'none',
                                color: '#6b7280',
                                fontSize: '11px',
                                cursor: 'pointer',
                                padding: 0
                              }}
                            >
                              ▲ 答えを隠す
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => togglePracticeAnswer(memo.id)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '8px',
                              color: '#00f2fe',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            👁️ 答えを確認する
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
        {/* TAB 3: ✏️ メモ作成 ＆ 編集・管理画面 */}
        {/* ========================================================= */}
        {activeTab === 'memos' && (
          <section>
            {/* 新規作成フォーム */}
            <div style={{
              background: 'rgba(17, 24, 39, 0.7)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              marginBottom: '32px'
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: 0, marginBottom: '20px', color: '#e5e7eb' }}>
                新規カード作成
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => setType('question')}
                  style={{
                    padding: '10px',
                    borderRadius: '12px',
                    border: type === 'question' ? '1px solid #00f2fe' : '1px solid rgba(255,255,255,0.05)',
                    background: type === 'question' ? 'rgba(0, 242, 254, 0.1)' : 'rgba(255,255,255,0.02)',
                    color: type === 'question' ? '#00f2fe' : '#9ca3af',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  ❓ 問題 / 解答
                </button>
                <button
                  type="button"
                  onClick={() => setType('simple')}
                  style={{
                    padding: '10px',
                    borderRadius: '12px',
                    border: type === 'simple' ? '1px solid #00f2fe' : '1px solid rgba(255,255,255,0.05)',
                    background: type === 'simple' ? 'rgba(0, 242, 254, 0.1)' : 'rgba(255,255,255,0.02)',
                    color: type === 'simple' ? '#00f2fe' : '#9ca3af',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  📝 シンプルメモ
                </button>
              </div>

              <form onSubmit={handleAddMemo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>
                    {type === 'question' ? 'QUESTION' : 'TITLE'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={type === 'question' ? '例: アナボリックとは？' : '例: 今日のメモ'}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {type === 'question' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>
                      ANSWER
                    </label>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="例: 同化作用。物質を合成して組織を作るプロセスのこと。"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  style={{
                    padding: '14px',
                    background: '#f3f4f6',
                    color: '#090d16',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                    marginTop: '8px'
                  }}
                >
                  追加 ＆ 忘却曲線通知を自動予約
                </button>
              </form>
            </div>

            {/* 管理用カードリスト */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: '#e5e7eb' }}>
                登録済みカードの管理
              </h3>

              {memos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>カードがありません</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {memos.map((memo) => (
                    <div
                      key={memo.id}
                      style={{
                        background: 'rgba(17, 24, 39, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '16px',
                        padding: '16px',
                        backdropFilter: 'blur(8px)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#6b7280' }}>
                          {new Date(memo.created_at).toLocaleDateString('ja-JP')}
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleSchedulePush(memo)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: 'rgba(0, 242, 254, 0.08)',
                              color: '#00f2fe',
                              border: '1px solid rgba(0, 242, 254, 0.2)',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            ⏱ 10秒後テスト
                          </button>
                          <button
                            onClick={() => handleDeleteMemo(memo.id)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              background: 'transparent',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            削除
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#f3f4f6' }}>{memo.title}</div>
                      {memo.answer && (
                        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>{memo.answer}</div>
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