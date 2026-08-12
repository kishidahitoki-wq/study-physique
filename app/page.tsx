'use client';

import { useState, useEffect } from 'react';

// メモ（問題・解答）の型定義
type Memo = {
  id: string;
  type: 'question' | 'simple'; // 「問題・解答」か「シンプルメモ」か
  title: string;
  answer?: string;
  createdAt: string;
};

export default function Home() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [type, setType] = useState<'question' | 'simple'>('question');
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');

  // Web Push 関連の状態
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<string>('初期化中...');

  // Service Worker の登録 & Web Push 初期化
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        setStatus('準備完了');
      }).catch(err => setStatus('SW登録失敗: ' + err.message));
    } else {
      setStatus('Web Push未対応環境です（iOSはホーム追加必須）');
    }
  }, []);

  // 通知の許可と登録
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
      setStatus('通知許可OK！');
    } catch (err: any) {
      alert('エラー: ' + err.message);
    }
  };

  // メモの追加
  const handleAddMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newMemo: Memo = {
      id: Date.now().toString(),
      type,
      title,
      answer: type === 'question' ? answer : undefined,
      createdAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    };

    setMemos([newMemo, ...memos]);
    setTitle('');
    setAnswer('');
  };

  // メモの削除
  const handleDeleteMemo = (id: string) => {
    setMemos(memos.filter(memo => memo.id !== id));
  };

  // 特定のメモを10秒後に通知テスト
  const handleSchedulePush = async (memo: Memo) => {
    if (!subscription) {
      alert('先に画面上の「通知を許可して登録」ボタンを押してください');
      return;
    }

    const pushTitle = memo.type === 'question' ? `【復習】${memo.title}` : `【メモ】${memo.title}`;
    const pushBody = memo.type === 'question' ? `答え：${memo.answer || 'なしかも'}` : memo.title;

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
      alert(`「${memo.title}」を10秒後に通知予約しました！アプリを閉じて待ってください。`);
    } else {
      alert('通知予約に失敗しました');
    }
  };

  return (
    <main style={{ padding: '24px 16px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', color: '#333' }}>
      <h1 style={{ fontSize: '24px', textAlign: 'center', marginBottom: '8px' }}>💪 Physique Study</h1>
      <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '20px' }}>
        ステータス: {status}
      </p>

      {/* 通知許可ボタン */}
      {!subscription && (
        <div style={{ textIndent: 0, textAlign: 'center', marginBottom: '24px' }}>
          <button 
            onClick={handleSubscribe}
            style={{ padding: '10px 20px', fontSize: '14px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔔 通知を許可して有効化する
          </button>
        </div>
      )}

      {/* メモ登録フォーム */}
      <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '12px' }}>新規メモ・問題の追加</h2>
        
        {/* タイプ選択（問題 vs シンプルメモ） */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setType('question')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              backgroundColor: type === 'question' ? '#2563eb' : '#fff',
              color: type === 'question' ? '#fff' : '#333',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            ❓ 問題と解答
          </button>
          <button
            type="button"
            onClick={() => setType('simple')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              backgroundColor: type === 'simple' ? '#2563eb' : '#fff',
              color: type === 'simple' ? '#fff' : '#333',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            📝 シンプルメモ
          </button>
        </div>

        <form onSubmit={handleAddMemo} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              {type === 'question' ? '問題文 / 表面' : 'メモタイトル'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'question' ? '例: アナボリックとは？' : '例: 明日のトレメニュー'}
              required
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>

          {type === 'question' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                解答 / 裏面
              </label>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="例: 体内で物質が合成されて組織が作られること（筋肥大など）"
                rows={3}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <button
            type="submit"
            style={{ padding: '12px', backgroundColor: '#111827', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
          >
            保存する
          </button>
        </form>
      </div>

      {/* メモ一覧 */}
      <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>登録済みメモ・問題 ({memos.length})</h2>
      {memos.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '24px 0' }}>まだメモがありません</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {memos.map((memo) => (
            <div
              key={memo.id}
              style={{ padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', backgroundColor: memo.type === 'question' ? '#dbeafe' : '#f3f4f6', color: memo.type === 'question' ? '#1e40af' : '#374151', fontWeight: 'bold' }}>
                  {memo.type === 'question' ? '問題' : 'メモ'}
                </span>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>{memo.createdAt}</span>
              </div>

              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>{memo.title}</h3>
              
              {memo.type === 'question' && memo.answer && (
                <div style={{ backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '6px', fontSize: '14px', color: '#475569', marginBottom: '12px' }}>
                  <strong>答:</strong> {memo.answer}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={() => handleSchedulePush(memo)}
                  style={{ flex: 1, padding: '8px', fontSize: '12px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ⏰ 10秒後にテスト通知
                </button>
                <button
                  onClick={() => handleDeleteMemo(memo.id)}
                  style={{ padding: '8px 12px', fontSize: '12px', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
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