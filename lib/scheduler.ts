// // テスト用：秒単位の配列（5秒、10秒、20秒、30秒、40秒後）
// export const FORGETTING_STAGES = [5, 10, 20, 30, 40];

// export function calculateRandomScheduleTime(secondsToAdd: number): string {
//   const targetDate = new Date();
  
//   // 現在時刻に指定の「秒数」をプラス
//   targetDate.setSeconds(targetDate.getSeconds() + secondsToAdd);

//   // ISO文字列に変換して返す
//   return targetDate.toISOString();
// }

// エビングハウスの忘却曲線に基づく復習日数（1日後、3日後、7日後、14日後、30日後）
export const FORGETTING_STAGES = [1, 3, 7, 14, 30];

/**
 * 指定日数後の 8:00 〜 23:00 の間からランダムな日時（ISO文字列）を生成
 */
export function calculateRandomScheduleTime(daysAfter: number): string {
  const targetDate = new Date();
  
  // 指定日数を追加
  targetDate.setDate(targetDate.getDate() + daysAfter);

  // 8時〜22時台（8:00:00 〜 22:59:59）の間からランダムに設定
  const randomHours = 8 + Math.floor(Math.random() * 15); // 8〜22
  const randomMinutes = Math.floor(Math.random() * 60);
  const randomSeconds = Math.floor(Math.random() * 60);

  targetDate.setHours(randomHours, randomMinutes, randomSeconds, 0);

  return targetDate.toISOString();
}