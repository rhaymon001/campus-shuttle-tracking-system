<template>
  <div v-if="authStore.isAuthenticated" class="notif-root">
    <button class="bell-btn" :aria-label="`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`" @click.stop="toggle">
      <Bell :size="18" />
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <transition name="notif-fade">
      <div v-if="open" class="notif-panel" @click.stop>
        <div class="notif-head">
          <strong>Notifications</strong>
          <button v-if="unreadCount > 0" class="mark-all" @click="markAllRead">Mark all read</button>
        </div>

        <div v-if="canOptInPush" class="push-row">
          <span class="push-ico"><BellRing :size="18" /></span>
          <div class="push-copy">
            <strong>Know when your shuttle is close</strong>
            <p>Turn on alerts to hear about arrivals, even when this tab is closed.</p>
          </div>
          <button class="btn btn-sm" :disabled="pushBusy" @click="requestPush">{{ pushBusy ? 'Asking…' : 'Turn on' }}</button>
        </div>
        <p v-else-if="pushPermission === 'denied'" class="push-note warn"><BellOff :size="14" /> Alerts are blocked for this site. Allow notifications in your browser’s site settings, then reopen this panel.</p>
        <p v-else-if="pushPermission === 'unsupported'" class="push-note"><BellOff :size="14" /> Arrival alerts aren’t available here. They need a secure (HTTPS) connection and a browser with push support.</p>
        <p v-else-if="pushNote" class="push-note warn"><BellOff :size="14" /> {{ pushNote }}</p>
        <p v-else class="push-note ok"><Check :size="14" /> Notifications are allowed in this browser.</p>

        <div v-if="loading" class="notif-state">Loading…</div>
        <div v-else-if="items.length === 0" class="notif-state">You’re all caught up.</div>

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
import { ref, computed, watch, onUnmounted } from 'vue';
import { Bell, BellRing, BellOff, Check } from 'lucide-vue-next';
import apiClient from '../api/axios';
import { connectSocket } from '../api/socket';
import { useAuthStore } from '../stores/auth';
import { enableWebPush, pushSupported } from '../composables/usePushNotifications';

const authStore = useAuthStore();

const open = ref(false);
const items = ref([]);
const unreadCount = ref(0);
const loading = ref(false);

const pushPermission = ref(pushSupported() ? Notification.permission : 'unsupported');
const canOptInPush = computed(() => pushPermission.value === 'default');

const pushBusy = ref(false);
const pushNote = ref('');

const requestPush = async () => {
  pushBusy.value = true;
  pushNote.value = '';
  try {
    const result = await enableWebPush();
    pushPermission.value = pushSupported() ? Notification.permission : 'unsupported';
    if (!result.ok) {
      console.warn('Web Push opt-in not completed:', result.reason);
      if (result.reason === 'no-vapid-key') pushNote.value = 'Allowed, but this app isn’t set up to send push alerts yet.';
      else if (result.reason === 'permission-error') pushNote.value = 'Couldn’t ask for permission. Try again in a moment.';
      else if (result.reason === 'no-service-worker') pushNote.value = 'Allowed. Background alerts start working in the installed (production) version of the app; this build has no service worker.';
    }
  } finally {
    pushBusy.value = false;
  }
};

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
  position: relative; width: 38px; height: 38px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--header-ink) 12%, transparent);
  border: 0; border-radius: 10px; color: var(--header-ink);
  transition: background var(--t-fast), transform var(--t-fast) var(--ease);
}
.bell-btn:hover { background: color-mix(in srgb, var(--header-ink) 22%, transparent); transform: translateY(-1px); }
.badge {
  position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px; padding: 0 5px;
  display: grid; place-items: center; border-radius: 99px;
  background: var(--signal); color: var(--on-signal);
  font: 700 10px var(--font-body); box-shadow: 0 0 0 2px var(--header-bg);
}
.notif-panel {
  position: absolute; top: calc(100% + 10px); right: 0;
  width: min(360px, calc(100vw - 24px)); max-height: 440px;
  display: flex; flex-direction: column; overflow: hidden; z-index: 450;
  background: var(--bg); color: var(--ink);
  border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-2);
  transform-origin: top right;
}
.notif-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.notif-head strong { font: 700 16px var(--font-display); letter-spacing: -.01em; }
.mark-all { background: transparent; border: 0; color: var(--brand); font: 600 12px var(--font-body); }
.mark-all:hover { text-decoration: underline; }
.push-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--surface); box-shadow: inset 3px 0 0 var(--signal); border-bottom: 1px solid var(--line); }
.push-ico { flex: none; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: var(--brand); color: var(--on-brand); }
.push-copy { flex: 1; min-width: 0; }
.push-copy strong { font-size: 13px; }
.push-copy p { font-size: 12px; color: var(--muted); line-height: 1.35; margin-top: 2px; }
.push-note { display: flex; align-items: flex-start; gap: 8px; padding: 10px 16px; font-size: 12px; line-height: 1.4; color: var(--muted); border-bottom: 1px solid var(--line); }
.push-note svg { flex: none; margin-top: 1px; }
.push-note.warn { color: var(--warn); background: var(--warn-bg); }
.push-note.ok { color: var(--brand); }
.notif-state { padding: 32px 16px; text-align: center; color: var(--muted); font-size: 13px; }
.notif-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.notif-item { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); cursor: pointer; transition: background var(--t-fast); }
.notif-item:last-child { border-bottom: 0; }
.notif-item:hover { background: var(--surface); }
.notif-item.unread { background: var(--ok-bg); }
.notif-type { flex: none; width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: var(--stale); }
.type-reservation { background: var(--brand); }
.type-waitlist { background: var(--warn); }
.type-proximity { background: var(--signal); }
.type-broadcast { background: var(--info); }
.type-system { background: var(--stale); }
.notif-body { min-width: 0; }
.notif-title { font-weight: 600; font-size: 13px; }
.notif-text { margin: 2px 0 4px; font-size: 13px; color: var(--muted); line-height: 1.4; }
.notif-time { font: 500 11px var(--font-mono); color: var(--stale); }
.notif-backdrop { position: fixed; inset: 0; z-index: 440; }
.notif-fade-enter-active, .notif-fade-leave-active { transition: opacity .16s ease, transform .2s var(--ease); }
.notif-fade-enter-from, .notif-fade-leave-to { opacity: 0; transform: translateY(-6px) scale(.98); }
</style>
