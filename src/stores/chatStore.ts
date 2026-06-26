import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref([])

  function abortActiveConnection() {}
  function clearAllConversations() {
    conversations.value = []
  }

  return { conversations, abortActiveConnection, clearAllConversations }
})
