import { Client } from '@upstash/qstash';
import { NextResponse } from 'next/server';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(request: Request) {
  try {
    const { subscription, delaySeconds } = await request.json();
    
    // Vercelデプロイ時のドメインを自動取得
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`;

    const res = await qstash.publishJSON({
      url: `${appUrl}/api/send-push`,
      body: {
        subscription,
        title: 'マッチョくんからの通知',
        body: '復習の時間だぞ！カタボリックを起こす前に復習しよう！',
      },
      delay: delaySeconds || 10, // デフォルト10秒後
    });

    return NextResponse.json({ success: true, messageId: res.messageId });
  } catch (error) {
    console.error('予約エラー:', error);
    return NextResponse.json({ error: 'Schedule failed' }, { status: 500 });
  }
}