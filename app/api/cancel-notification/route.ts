import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

// QStashクライアントの初期化
const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function POST(request: Request) {
  try {
    const { messageId } = await request.json();

    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    // QStashから予約メッセージを削除（キャンセル）
    await qstash.messages.delete({ id: messageId });

    return NextResponse.json({ success: true, message: 'Notification reservation cancelled.' });
  } catch (error: any) {
    console.error('Failed to cancel QStash message:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
