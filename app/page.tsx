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

// 今日の復習タスク用の型定義
type ReviewTask = {
  schedule_id: string;
  stage: number;
  memo: Memo;
};

export default function Home() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [todayTasks, setTodayTasks] = useState<ReviewTask[]>([]);
  const [showAnswerMap, setShowAnswerMap] = useState<{ [key: string]: boolean }>({});

  const [type, setType] = useState<'question' | 'simple'>('question');
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);

  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<string>('INITIALIZING...');

  // 初回起動時：データ取得
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

  // 今日以前が予定日時で、まだ未完了（completed = false）のタスクを取得
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
      .order('scheduled_at', { ascending: true }); // 到来日時が古い順

    if (error) {
      console.error('復習タスク取得エラー:', error);
    } else if (data) {
      // 💡 同一メモの重複を排除し、一番最初に到来した Stage の1枚だけを抽出する
      const uniqueMemoMap = new Map<string, ReviewTask>();

      for (const item of data) {
        // item.memos が存在し、まだ Map に登録されていない場合のみ追加
        if (item.memos && !uniqueMemoMap.has(item.memo_id)) {
          // 配列として返ってくる型を適切に Memo 型へ変換
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

  // 2. Service Worker & Push 初期化
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

  // メモの追加（Supabase保存 ＋ 忘却曲線スケジュール＆QStash通知予約）
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
      fetchTodayTasks(); // タスク再取得
    }
  };

  // 復習完了処理（`schedules` の `completed` を true に更新）
  const handleCompleteReview = async (scheduleId: string) => {
    const { error } = await supabase
      .from('schedules')
      .update({ completed: true })
      .eq('id', scheduleId);

    if (error) {
      alert('更新に失敗しました: ' + error.message);
    } else {
      // 画面から完了したタスクを除外
      setTodayTasks(todayTasks.filter(task => task.schedule_id !== scheduleId));
    }
  };

  // 解答表示の切り替え
  const toggleShowAnswer = (scheduleId: string) => {
    setShowAnswerMap(prev => ({
      ...prev,
      [scheduleId]: !prev[scheduleId],
    }));
  };

  // メモの削除
  const handleDeleteMemo = async (id: string) => {
    const { error } = await supabase.from('memos').delete().eq('id', id);
    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else {
      setMemos(memos.filter(memo => memo.id !== id));
      setTodayTasks(todayTasks.filter(task => task.memo.id !== id));
    }
  };

  // 通知の許可
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
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 16px 80px 16px' }}>

        <section style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
            Optimize Your Memory.
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
            忘却曲線アルゴリズムで記憶を完全定着。
          </p>
        </section>

        {/* 🔥 今日の復習セクション 🔥 */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#00f2fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔥 TODAY'S REVIEW
            </h2>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#00f2fe', background: 'rgba(0, 242, 254, 0.1)', border: '1px solid rgba(0, 242, 254, 0.3)', padding: '2px 10px', borderRadius: '12px' }}>
              {todayTasks.length} TASKS
            </span>
          </div>

          {todayTasks.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '32px 16px',
              background: 'rgba(0, 242, 254, 0.03)',
              border: '1px dashed rgba(0, 242, 254, 0.2)',
              borderRadius: '16px',
              color: '#9ca3af'
            }}>
              🎉 現在、復習が必要なカードはありません！完璧です！
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

                  {/* 解答エリア（アコーディオン） */}
                  {task.memo.type === 'question' && task.memo.answer && (
                    <div style={{ marginBottom: '16px' }}>
                      {showAnswerMap[task.schedule_id] ? (
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
                          onClick={() => toggleShowAnswer(task.schedule_id)}
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

                  {/* 完了アクションボタン */}
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

        {/* Form Card */}
        <section style={{
          background: 'rgba(17, 24, 39, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          marginBottom: '40px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: 0, marginBottom: '20px', color: '#e5e7eb' }}>
            新規カード作成 (忘却曲線＋ランダム時間通知予約)
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
              Supabaseへ追加 ＆ 通知を自動予約
            </button>
          </form>
        </section>

        {/* List */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#e5e7eb' }}>
              登録済み全リスト
            </h2>
            <span style={{ fontSize: '12px', color: '#6b7280', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
              {memos.length} CARDS
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>読み込み中...</div>
          ) : memos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', color: '#4b5563' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>カードがありません</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {memos.map((memo) => (
                <div
                  key={memo.id}
                  style={{
                    background: 'rgba(17, 24, 39, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '16px',
                    padding: '20px',
                    backdropFilter: 'blur(8px)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
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
                    <span style={{ fontSize: '11px', color: '#4b5563' }}>
                      {new Date(memo.created_at).toLocaleDateString('ja-JP')}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>{memo.title}</h3>

                  {memo.type === 'question' && memo.answer && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: '#9ca3af', marginBottom: '16px', borderLeft: '2px solid #00f2fe' }}>
                      {memo.answer}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button
                      onClick={() => handleSchedulePush(memo)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: 'rgba(0, 242, 254, 0.08)',
                        color: '#00f2fe',
                        border: '1px solid rgba(0, 242, 254, 0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      ⏱ 10秒後にテスト通知
                    </button>
                    <button
                      onClick={() => handleDeleteMemo(memo.id)}
                      style={{
                        padding: '10px 14px',
                        fontSize: '12px',
                        background: 'transparent',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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