import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function POST(req: Request) {
  try {
    const { messageId } = await req.json();

    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json(
        {
          error: 'messageId is required',
        },
        { status: 400 }
      );
    }

    await qstashClient.messages.delete(messageId);

    return NextResponse.json({
      success: true,
      messageId,
    });

  } catch (error: any) {
    console.error(
      'QStash Cancel Error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to cancel notification',
      },
      { status: 500 }
    );
  }
}