import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { Client } from '@upstash/qstash';
import { createClient } from '@supabase/supabase-js';

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  'mailto:example@yourdomain.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const MAX_DELAY_SECONDS =
  6 * 24 * 60 * 60 + 23 * 60 * 60;

export async function POST(req: Request) {
  try {
    const {
      subscription,
      title,
      pushBody,
      scheduledAt,
      scheduleId,
    } = await req.json();

    if (
      !subscription ||
      !scheduledAt ||
      !scheduleId
    ) {
      return NextResponse.json(
        {
          error:
            'Missing subscription, scheduledAt, or scheduleId',
        },
        { status: 400 }
      );
    }

    const targetTime =
      new Date(scheduledAt).getTime();

    if (Number.isNaN(targetTime)) {
      return NextResponse.json(
        {
          error: 'Invalid scheduledAt',
        },
        { status: 400 }
      );
    }

    const now = Date.now();

    const remainingSeconds = Math.floor(
      (targetTime - now) / 1000
    );

    /*
     * まだ通知時刻まで7日以上ある場合
     *
     * → 通知を送らない
     * → 次のQStashを予約する
     */
    if (
      remainingSeconds >
      MAX_DELAY_SECONDS
    ) {
      const host = req.headers.get('host');

      if (!host) {
        throw new Error(
          'Host header is missing'
        );
      }

      const protocol =
        host.includes('localhost')
          ? 'http'
          : 'https';

      const destinationUrl =
        `${protocol}://${host}/api/qstash`;

      const result =
        await qstashClient.publishJSON({
          url: destinationUrl,

          body: {
            subscription,
            title,
            pushBody,
            scheduledAt,
            scheduleId,
          },

          delay: MAX_DELAY_SECONDS,
        });

      /*
       * 中継用のmessageIdに更新
       */
      const { error: updateError } =
        await supabaseAdmin
          .from('schedules')
          .update({
            qstash_message_id:
              result.messageId,
          })
          .eq('id', scheduleId);

      if (updateError) {
        console.error(
          '[QStash] Failed to update messageId:',
          updateError
        );

        throw updateError;
      }

      console.log(
        '[QStash] Long-term notification rescheduled',
        {
          scheduleId,
          messageId:
            result.messageId,
          remainingSeconds,
        }
      );

      return NextResponse.json({
        success: true,
        rescheduled: true,
        messageId:
          result.messageId,
      });
    }

    /*
     * ここまで来たら通知時刻まで7日以内。
     *
     * ただし、QStashが少し早く実行された場合に
     * 通知時刻より前に通知しないようにする。
     */
    if (remainingSeconds > 0) {
      const host = req.headers.get('host');

      if (!host) {
        throw new Error(
          'Host header is missing'
        );
      }

      const protocol =
        host.includes('localhost')
          ? 'http'
          : 'https';

      const destinationUrl =
        `${protocol}://${host}/api/qstash`;

      const result =
        await qstashClient.publishJSON({
          url: destinationUrl,

          body: {
            subscription,
            title,
            pushBody,
            scheduledAt,
            scheduleId,
          },

          delay: Math.max(
            1,
            remainingSeconds
          ),
        });

      const { error: updateError } =
        await supabaseAdmin
          .from('schedules')
          .update({
            qstash_message_id:
              result.messageId,
          })
          .eq('id', scheduleId);

      if (updateError) {
        console.error(
          '[QStash] Failed to update messageId:',
          updateError
        );

        throw updateError;
      }

      console.log(
        '[QStash] Final notification rescheduled',
        {
          scheduleId,
          messageId:
            result.messageId,
          remainingSeconds,
        }
      );

      return NextResponse.json({
        success: true,
        rescheduled: true,
        messageId:
          result.messageId,
      });
    }

    /*
     * ============================
     * 通知時刻になった
     * ============================
     */

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title:
          title ||
          '復習の時間です！',

        body:
          pushBody ||
          '復習しましょう！',

        data: {
          url: '/',
          scheduleId,
        },
      })
    );

    /*
     * 通知送信後はscheduleを完了扱いにする。
     */
    const { error: completeError } =
      await supabaseAdmin
        .from('schedules')
        .update({
          completed: true,
          qstash_message_id: null,
        })
        .eq('id', scheduleId);

    if (completeError) {
      console.error(
        '[QStash] Failed to complete schedule:',
        completeError
      );
    }

    console.log(
      '[QStash] Notification sent',
      {
        scheduleId,
      }
    );

    return NextResponse.json({
      success: true,
      notified: true,
    });

  } catch (error: any) {
    console.error(
      '[QStash] Error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to process notification',
      },
      {
        status: 500,
      }
    );
  }
}