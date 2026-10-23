/*
 * 山の一覧。並び順に、ひとつ前の山の山頂に着くと次の山が選べるようになる
 *   新しい山を足すときは、mountains/<id>.js を作って、ここに1行足す
 *   file: 山のデータのファイル (選んだときに読み込む)
 *   name: 山の選択画面に出す名前 (データを読み込む前に使う)
 */
window.SUMMIT_MOUNTAIN_LIST = [
  { id: 'tengu', file: 'mountains/tengu.js', name: { ja: '天狗山', en: 'Mt. Tengu', zh: '天狗山', ko: '텐구산' }, height: 1000 },
];
