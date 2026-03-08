<script>
  import { goto } from '$app/navigation';
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="text-center">
		<h1 class="text-4xl font-bold text-gray-900 mb-8">momolog</h1>

		<div class="space-y-4">
			<button 
				onclick={() => goto('/record')}
				class="block w-full max-w-sm mx-auto rounded-lg bg-blue-600 px-6 py-4 text-white text-lg font-semibold shadow hover:bg-blue-700"
			>
				📷 カメラで撮影
			</button>

			<button 
				onclick={() => goto('/upload')}
				class="block w-full max-w-sm mx-auto rounded-lg border border-gray-300 bg-white px-6 py-4 text-gray-700 text-lg font-semibold shadow-sm hover:bg-gray-50"
			>
				📁 ファイルを選択
			</button>
		</div>
	</div>
</div>
