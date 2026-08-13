import { NextResponse } from 'next/server';
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:example@yourdomain.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subscription, title, pushBody } = body;

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription missing' }, { status: 400 });
    }

    // Web Push通知を送信！
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || '【Physique Study】復習の時間だ！',
        body: pushBody || '復習して筋肉（記憶）をパンプアップさせよう！',
      })
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('QStash Push Notification Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}