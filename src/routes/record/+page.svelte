<script>
  let chunks = [];
  let recorder;
  let stream;
  let previewEl;
  let isRecording = $state(false);

  async function startRecording() {
    chunks = []; // リセット
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    previewEl.srcObject = stream;

    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.split('/')[1];
      const file = new File([blob], `recorded_${Date.now()}.${ext}`, { type: mimeType });

      // プレビューを録画済み映像に切り替え
      previewEl.srcObject = null;
      previewEl.src = URL.createObjectURL(blob);
      previewEl.controls = true;

      uploadToFirebase(file);
    };

    recorder.start(100);
    isRecording = true;
  }

  function stopRecording() {
    recorder.stop();
    stream.getTracks().forEach(track => track.stop());
    isRecording = false;
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
	<h2 class="mb-6 text-2xl font-bold text-gray-900">カメラで撮影</h2>
	<video bind:this={previewEl} autoplay muted class="mb-4 w-full max-w-md rounded border"></video>

	{#if !isRecording}
	  <button onclick={startRecording} class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700">撮影開始</button>
	{:else}
	  <button onclick={stopRecording} class="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700">撮影停止・アップロード</button>
	{/if}

	<div class="mt-6">
		<a href="/" class="text-blue-600 underline">← ダッシュボードに戻る</a>
	</div>
</div>