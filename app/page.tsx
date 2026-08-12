'use client';

import { useState, useEffect } from 'react';

type Memo = {
  id: string;
  type: 'question' | 'simple';
  title: string;
  answer?: string;
  createdAt: string;
};

export default function Home() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [type, setType] = useState<'question' | 'simple'>('question');
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');

  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<string>('INITIALIZING...');

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        setStatus('READY');
      }).catch(err => setStatus('SW ERROR: ' + err.message));
    } else {
      setStatus('UNSUPPORTED (iOS NEEDS PWA)');
    }
  }, []);

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

  const handleDeleteMemo = (id: string) => {
    setMemos(memos.filter(memo => memo.id !== id));
  };

  const handleSchedulePush = async (memo: Memo) => {
    if (!subscription) {
      alert('先に画面上部の「NOTIFICATION ENABLE」を押してください');
      return;
    }

    const pushTitle = memo.type === 'question' ? `【復習】${memo.title}` : `【メモ】${memo.title}`;
    const pushBody = memo.type === 'question' ? `答え：${memo.answer || 'なかも'}` : memo.title;

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
      alert(`「${memo.title}」を10秒後に予約しました！アプリを閉じて待ってください。`);
    } else {
      alert('予約に失敗しました');
    }
  };

  return (
    <div style={{ backgroundColor: '#090d16', color: '#f3f4f6', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* 1. Sticky Navigation Header */}
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

      {/* Main Container */}
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 16px 80px 16px' }}>

        {/* 2. Hero Section */}
        <section style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
            Optimize Your Memory.
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
            筋トレのように記憶を鍛える。忘却曲線を超越する通知型学習システム。
          </p>
        </section>

        {/* 3. Form Card Section (Glassmorphism) */}
        <section style={{
          background: 'rgba(17, 24, 39, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          marginBottom: '40px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: 0, marginBottom: '20px', color: '#e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>新規カード作成</span>
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
                cursor: 'pointer',
                transition: 'all 0.2s'
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
                cursor: 'pointer',
                transition: 'all 0.2s'
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
                  boxSizing: 'border-box',
                  outline: 'none'
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
                    boxSizing: 'border-box',
                    outline: 'none'
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
                marginTop: '8px',
                transition: 'opacity 0.2s'
              }}
            >
              カードを追加する
            </button>
          </form>
        </section>

        {/* 4. Memo List Section */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#e5e7eb' }}>
              登録済みリスト
            </h2>
            <span style={{ fontSize: '12px', color: '#6b7280', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
              {memos.length} CARDS
            </span>
          </div>

          {memos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', color: '#4b5563' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>登録されたカードがありません</p>
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
                      letterSpacing: '0.05em',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: memo.type === 'question' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                      color: memo.type === 'question' ? '#00f2fe' : '#9ca3af'
                    }}>
                      {memo.type === 'question' ? 'QUESTION' : 'MEMO'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#4b5563' }}>{memo.createdAt}</span>
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