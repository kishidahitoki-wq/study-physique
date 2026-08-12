'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<string>('初期化中...');

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        setStatus('準備完了。「1. 通知許可＆登録」を押してください');
      }).catch(err => setStatus('SW登録失敗: ' + err.message));
    } else {
      setStatus('Web Push未対応環境です（iOSはホーム追加必須）');
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
      setStatus('通知許可OK！「2. 10秒後に通知テスト」を押せます');
    } catch (err: any) {
      alert('エラー: ' + err.message);
    }
  };

  const handleTestNotification = async () => {
    if (!subscription) return;
    setStatus('10秒後に通知を予約中...');

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        delaySeconds: 10 // ★10秒後に発火
      })
    });

    if (res.ok) {
      setStatus('予約完了！アプリを閉じて（スマホをロックして）10秒待ってください！');
    } else {
      setStatus('予約失敗...');
    }
  };

  return (
    <main style={{ padding: '40px 20px', fontFamily: 'sans-serif', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
      <h1>Web Push 通知検証</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>{status}</p>

      {!subscription ? (
        <button 
          onClick={handleSubscribe} 
          style={{ padding: '14px 28px', fontSize: '16px', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc' }}
        >
          1. 通知を許可して登録
        </button>
      ) : (
        <button 
          onClick={handleTestNotification} 
          style={{ padding: '14px 28px', fontSize: '16px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          2. 10秒後に通知テストを予約
        </button>
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