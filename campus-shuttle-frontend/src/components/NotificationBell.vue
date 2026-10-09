<template>
  <div v-if="authStore.isAuthenticated" class="notif-root">
    <button class="bell-btn" @click.stop="toggle">
      <Bell :size="18" />
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <transition name="notif-fade">
      <div v-if="open" class="notif-panel" @click.stop>
        <div class="notif-head">
          <strong>Notifications</strong>
          <button v-if="unreadCount > 0" class="mark-all" @click="markAllRead">Mark all read</button>
        </div>

        <div v-if="loading" class="notif-state">Loading…</div>
        <div v-else-if="items.length === 0" class="notif-state">You're all caught up.</div>

        <ul v-else class="notif-list">
          <li
            v-for="n in items"
            :key="n._id"
            class="notif-item"
            :class="{ unread: !n.read }"
            @click="openItem(n)"
          >
            <span class="notif-type" :class="`type-${n.type}`"></span>
            <div class="notif-body">
              <p class="notif-title">{{ n.title }}</p>
              <p class="notif-text">{{ n.body }}</p>
              <span class="notif-time">{{ timeAgo(n.createdAt) }}</span>
            </div>
          </li>
        </ul>
      </div>
    </transition>

    <div v-if="open" class="notif-backdrop" @click="close"></div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { Bell } from 'lucide-vue-next';
import apiClient from '../api/axios';
import { connectSocket } from '../api/socket';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

const open = ref(false);
const items = ref([]);
const unreadCount = ref(0);
const loading = ref(false);

let socket = null;
let onNotificationNew = null;

const fetchFeed = async () => {
  loading.value = true;
  try {
    const [feed, count] = await Promise.all([
      apiClient.get('/notifications'),
      apiClient.get('/notifications/unread-count')
    ]);
    items.value = feed.data.items || [];
    unreadCount.value = count.data.count || 0;
  } catch (err) {
    // 401s are handled by the axios interceptor (boots to /login); others are silent
  } finally {
    loading.value = false;
  }
};

const attachSocket = () => {
  if (!authStore.token) return;
  socket = connectSocket(authStore.token);
  if (!onNotificationNew) {
    onNotificationNew = ({ notification }) => {
      if (!notification) return;
      items.value = [notification, ...items.value];
      unreadCount.value += 1;
    };
  }
  socket.off('notification:new', onNotificationNew);
  socket.on('notification:new', onNotificationNew);
};

watch(
  () => authStore.isAuthenticated,
  (authed) => {
    if (authed) {
      fetchFeed();
      attachSocket();
    } else {
      open.value = false;
      items.value = [];
      unreadCount.value = 0;
      socket = null;
    }
  },
  { immediate: true }
);

const toggle = () => { open.value = !open.value; };
const close = () => { open.value = false; };

const markAllRead = async () => {
  try {
    await apiClient.patch('/notifications/read-all');
    items.value.forEach((n) => { n.read = true; });
    unreadCount.value = 0;
  } catch (err) { /* silent */ }
};

const openItem = async (n) => {
  const isUnread = !n.read;
  n.read = true;
  if (isUnread && unreadCount.value > 0) unreadCount.value -= 1;
  try {
    await apiClient.patch(`/notifications/${n._id}/read`);
  } catch (err) { /* silent */ }
  close();
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

onUnmounted(() => {
  if (socket && onNotificationNew) socket.off('notification:new', onNotificationNew);
});
</script>

<style scoped>
.notif-root { position: relative; }
.bell-btn {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 8px;
  color: #FFFFFF;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.bell-btn:hover { background: rgba(255, 255, 255, 0.16); }
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #E24B4A;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 600;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.notif-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 340px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  z-index: 300;
  overflow: hidden;
}
.notif-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
  color: #1A1A18;
}
.mark-all {
  background: transparent;
  border: none;
  color: #0F6E56;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.notif-state { padding: 28px 14px; text-align: center; color: #5F5E5A; font-size: 13px; }
.notif-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.notif-item {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.05);
  cursor: pointer;
}
.notif-item:hover { background: #F4F3EF; }
.notif-item.unread { background: #EAF7F2; }
.notif-type { flex-shrink: 0; width: 8px; height: 8px; border-radius: 999px; margin-top: 5px; }
.type-reservation { background: #0F6E56; }
.type-waitlist { background: #C77E1E; }
.type-proximity { background: #1D9E75; }
.type-broadcast { background: #B14B92; }
.type-system { background: #5F5E5A; }
.notif-body { min-width: 0; }
.notif-title { margin: 0; font-size: 13px; font-weight: 600; color: #1A1A18; }
.notif-text { margin: 2px 0 4px; font-size: 12px; color: #47453F; line-height: 1.4; }
.notif-time { font-size: 11px; color: #8A8880; }
.notif-backdrop { position: fixed; inset: 0; z-index: 290; }
.notif-fade-enter-active, .notif-fade-leave-active { transition: opacity 0.12s ease; }
.notif-fade-enter-from, .notif-fade-leave-to { opacity: 0; }
</style>