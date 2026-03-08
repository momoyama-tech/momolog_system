<script>
  let previewEl;

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    previewEl.src = URL.createObjectURL(file);
    uploadToFirebase(file);
  }

  async function uploadToFirebase(file) {
    // 1. FormDataにファイルを詰める
    const formData = new FormData();
    formData.append('video', file);

    try {
      // 2. SvelteKitのサーバーにPOST送信
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        alert('アップロード成功しました！');
        console.log('保存先URL:', result.url);
      } else {
        alert('エラーが発生しました: ' + result.error);
      }
    } catch (error) {
      console.error('送信エラー:', error);
      alert('通信エラーが発生しました。');
    }
  }
</script>

<div class="mx-auto max-w-2xl p-6">
	<h2 class="mb-6 text-2xl font-bold text-gray-900">ファイルを選択</h2>
	<input type="file" accept="video/*" onchange={handleFileSelect} class="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
	<video bind:this={previewEl} controls class="w-full max-w-md rounded border"></video>

	<div class="mt-6">
		<a href="/" class="text-blue-600 underline">← ダッシュボードに戻る</a>
	</div>
</div>
