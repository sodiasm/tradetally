<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50 transition-opacity" @click="emit('close')"></div>

      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg">
        <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Connect Alpaca {{ environmentLabel }} Account
          </h3>
          <button
            @click="emit('close')"
            class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6">
          <div class="mb-6 p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
            <h4 class="text-sm font-medium text-cyan-800 dark:text-cyan-300 mb-2">Setup Instructions</h4>
            <ol class="text-sm text-cyan-700 dark:text-cyan-400 space-y-2 list-decimal list-inside">
              <li>Log in to Alpaca and open your {{ environmentLabel.toLowerCase() }} trading account.</li>
              <li>Create or copy an API Key ID and Secret Key.</li>
              <li>Paste them below. The secret is encrypted at rest and will not be shown again.</li>
            </ol>
          </div>

          <div v-if="props.error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div class="flex">
              <svg class="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
              <p class="ml-3 text-sm text-red-700 dark:text-red-300">{{ props.error }}</p>
            </div>
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label for="alpacaAccountLabel" class="label">Account Label</label>
              <input
                id="alpacaAccountLabel"
                v-model="form.accountLabel"
                type="text"
                class="input"
                :placeholder="`e.g., ${environmentLabel} Strategy A`"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Use a clear label if you connect multiple Alpaca accounts.
              </p>
            </div>

            <div>
              <label for="alpacaApiKeyId" class="label">API Key ID</label>
              <input
                id="alpacaApiKeyId"
                v-model="form.apiKeyId"
                type="password"
                class="input"
                placeholder="PK..."
                autocomplete="off"
                required
              />
            </div>

            <div>
              <label for="alpacaApiSecret" class="label">API Secret Key</label>
              <input
                id="alpacaApiSecret"
                v-model="form.apiSecret"
                type="password"
                class="input"
                placeholder="Enter your Alpaca secret key"
                autocomplete="off"
                required
              />
            </div>

            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <label class="block text-sm font-medium text-gray-900 dark:text-white">Auto-Sync</label>
                <p class="text-sm text-gray-500 dark:text-gray-400">Automatically sync trades daily</p>
              </div>
              <button
                type="button"
                @click="form.autoSyncEnabled = !form.autoSyncEnabled"
                :class="[
                  form.autoSyncEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600',
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2'
                ]"
              >
                <span
                  :class="[
                    form.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0',
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                  ]"
                />
              </button>
            </div>

            <div v-if="form.autoSyncEnabled">
              <label for="alpacaSyncTime" class="label">Sync Time</label>
              <input id="alpacaSyncTime" v-model="form.syncTime" type="time" class="input" />
            </div>

            <div>
              <label class="label">Sync Trades From</label>
              <div class="flex flex-wrap gap-2 mb-2">
                <button
                  v-for="preset in syncRangePresets"
                  :key="preset.id"
                  type="button"
                  @click="applySyncRangePreset(preset.id)"
                  :class="[
                    'px-3 py-1 text-sm rounded-full border transition-colors',
                    activePreset === preset.id
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                  ]"
                >
                  {{ preset.label }}
                </button>
              </div>
              <input
                v-if="activePreset === 'custom'"
                v-model="form.syncStartDate"
                type="date"
                class="input"
                :max="todayIso"
              />
            </div>
          </form>
        </div>

        <div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button type="button" @click="emit('close')" class="btn-secondary">Cancel</button>
          <button @click="handleSubmit" :disabled="loading || !isValid" class="btn-primary">
            <span v-if="loading" class="flex items-center">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Connecting...
            </span>
            <span v-else>Connect</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { syncRangePresets, applyPresetToForm, todayIso } from '@/utils/syncRangePresets'

const props = defineProps({
  environment: {
    type: String,
    required: true,
    validator: value => ['live', 'paper'].includes(value)
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'save'])

const form = ref({
  accountLabel: '',
  apiKeyId: '',
  apiSecret: '',
  autoSyncEnabled: false,
  syncFrequency: 'manual',
  syncTime: '06:00',
  syncStartDate: null
})

const activePreset = ref('all')
const environmentLabel = computed(() => props.environment === 'paper' ? 'Paper' : 'Live')

const isValid = computed(() => {
  return form.value.apiKeyId.trim().length > 0 && form.value.apiSecret.trim().length > 0
})

function applySyncRangePreset(presetId) {
  activePreset.value = presetId
  applyPresetToForm(form.value, presetId)
}

function handleSubmit() {
  if (!isValid.value) return

  emit('save', {
    environment: props.environment,
    accountLabel: form.value.accountLabel,
    apiKeyId: form.value.apiKeyId,
    apiSecret: form.value.apiSecret,
    autoSyncEnabled: form.value.autoSyncEnabled,
    syncFrequency: form.value.autoSyncEnabled ? 'daily' : 'manual',
    syncTime: form.value.syncTime + ':00',
    syncStartDate: form.value.syncStartDate
  })
}
</script>
