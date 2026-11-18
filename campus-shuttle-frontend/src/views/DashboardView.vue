<template>
  <div class="shell">
    <aside class="sidebar">
      <nav class="nav-menu" aria-label="Main">
        <p class="eyebrow nav-label">Student portal</p>
        <router-link to="/dashboard" class="nav-item" exact-active-class="active"><Radio :size="18" /><span>Live tracking</span></router-link>
        <router-link to="/dashboard/routes" class="nav-item" active-class="active"><Route :size="18" /><span>Routes</span></router-link>
        <router-link to="/dashboard/schedules" class="nav-item" active-class="active"><CalendarClock :size="18" /><span>Schedules</span></router-link>
      </nav>

      <button class="user-badge" @click="isAccountOpen = true">
        <span class="avatar">{{ initials }}</span>
        <span class="who">
          <strong>{{ authStore.user?.name || 'Student' }}</strong>
          <small>Account and password</small>
        </span>
        <ChevronRight :size="16" />
      </button>
    </aside>

    <div class="content">
      <router-view v-slot="{ Component, route }">
        <Transition name="view" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </div>

    <nav class="tabbar" aria-label="Main">
      <router-link to="/dashboard" class="tab" exact-active-class="active"><span class="tab-ico"><Radio :size="20" /></span>Live</router-link>
      <router-link to="/dashboard/routes" class="tab" active-class="active"><span class="tab-ico"><Route :size="20" /></span>Routes</router-link>
      <router-link to="/dashboard/schedules" class="tab" active-class="active"><span class="tab-ico"><CalendarClock :size="20" /></span>Schedules</router-link>
      <button class="tab" :class="{ active: isAccountOpen }" @click="isAccountOpen = true"><span class="tab-ico"><UserRound :size="20" /></span>Account</button>
    </nav>

    <Transition name="drawer">
      <div v-if="isAccountOpen" class="scrim" @click.self="closeAccount">
        <section class="sheet" role="dialog" aria-modal="true" aria-label="Account">
          <header class="sheet-head">
            <span class="avatar lg">{{ initials }}</span>
            <div class="sheet-who">
              <h2>{{ authStore.user?.name || 'Student' }}</h2>
              <p class="eyebrow">{{ authStore.user?.role || 'student' }}</p>
            </div>
            <button class="icon-btn" aria-label="Close" @click="closeAccount"><X :size="18" /></button>
          </header>

          <form class="pw-form" @submit.prevent="handlePasswordChange">
            <h3><KeyRound :size="16" /> Change password</h3>
            <div v-if="passwordFeedback" class="feedback" :class="passwordFeedback.type" role="status">{{ passwordFeedback.message }}</div>
            <div class="field">
              <label for="pw-current">Current password</label>
              <PasswordInput id="pw-current" v-model="passwordForm.currentPassword" autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="pw-new">New password</label>
              <PasswordInput id="pw-new" v-model="passwordForm.newPassword" autocomplete="new-password" placeholder="At least 6 characters" />
              <PasswordFeedback :password="passwordForm.newPassword" :current="passwordForm.currentPassword" />
            </div>
            <div class="field">
              <label for="pw-confirm">Confirm new password</label>
              <PasswordInput id="pw-confirm" v-model="passwordForm.confirmPassword" autocomplete="new-password" :has-error="!!passwordForm.confirmPassword && !passwordForm.newPassword.startsWith(passwordForm.confirmPassword)" />
              <PasswordFeedback mode="match" :password="passwordForm.newPassword" :confirm="passwordForm.confirmPassword" />
            </div>
            <button class="btn" type="submit" :disabled="changingPassword || !canSubmitPasswordForm">{{ changingPassword ? 'Updating…' : 'Update password' }}</button>
          </form>

          <button class="btn btn-danger signout" @click="handleLogout"><LogOut :size="16" /> Sign out</button>
        </section>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { Radio, Route, CalendarClock, LogOut, UserRound, X, KeyRound, ChevronRight } from 'lucide-vue-next';
import PasswordInput from '../components/PasswordInput.vue';
import PasswordFeedback from '../components/PasswordFeedback.vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const isAccountOpen = ref(false); // account sheet (password + sign out)
const changingPassword = ref(false);
const passwordFeedback = ref(null);

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const canSubmitPasswordForm = computed(() => {
  return passwordForm.currentPassword && passwordForm.newPassword && passwordForm.confirmPassword &&
    passwordForm.newPassword.length >= 6 && passwordForm.newPassword === passwordForm.confirmPassword &&
    passwordForm.newPassword !== passwordForm.currentPassword;
});

const closeAccount = () => { isAccountOpen.value = false; };
const initials = computed(() => (authStore.user?.name || 'S').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''));
const onKeydown = (e) => { if (e.key === 'Escape') closeAccount(); };
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
const handleLogout = () => { authStore.logout(); router.push('/login'); };

const handlePasswordChange = async () => {
  if (!canSubmitPasswordForm.value) {
    passwordFeedback.value = { type: 'error', message: 'Please complete all fields and ensure the new password matches.' };
    return;
  }

  changingPassword.value = true;
  passwordFeedback.value = null;

  try {
    const response = await authStore.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    });

    passwordFeedback.value = { type: 'success', message: response.message };
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
  } catch (err) {
    passwordFeedback.value = { type: 'error', message: err || 'Failed to update your password.' };
  } finally {
    changingPassword.value = false;
  }
};
</script>

<style scoped>
.shell { --top: calc(var(--header-h) + var(--safe-t)); min-height: calc(100dvh - var(--top)); }
.content { min-height: calc(100dvh - var(--top)); padding-bottom: calc(var(--nav-h) + var(--safe-b)); }

.sidebar { display: none; }
.nav-label { padding: 0 12px 10px; }
.nav-item {
  position: relative; display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 10px;
  color: var(--muted); text-decoration: none; font-weight: 600; font-size: 14px;
  transition: color var(--t-fast), background var(--t-fast), transform var(--t-fast) var(--ease);
}
.nav-item:hover { color: var(--ink); background: var(--surface-2); transform: translateX(2px); }
.nav-item.active { color: var(--brand); background: var(--ok-bg); }
.nav-item.active::before { content: ''; position: absolute; left: -16px; top: 9px; bottom: 9px; width: 4px; border-radius: 0 4px 4px 0; background: var(--signal); }

.avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--brand); color: var(--on-brand); font: 700 13px var(--font-display); letter-spacing: .02em; }
.avatar.lg { width: 48px; height: 48px; font-size: 17px; }
.user-badge { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--bg); transition: border-color var(--t-fast), transform var(--t-fast) var(--ease); }
.user-badge:hover { border-color: var(--brand); transform: translateY(-1px); }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.who strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.who small { color: var(--muted); font-size: 12px; }

.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 350; height: calc(var(--nav-h) + var(--safe-b)); padding-bottom: var(--safe-b);
  display: grid; grid-template-columns: repeat(4, 1fr); background: var(--bg); border-top: 1px solid var(--line);
}
.tab { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 0; background: none; color: var(--muted); text-decoration: none; font: 600 11px var(--font-body); }
.tab-ico { width: 52px; height: 30px; border-radius: 99px; display: grid; place-items: center; transition: background var(--t-med) var(--ease), color var(--t-fast), transform var(--t-med) var(--ease); }
.tab.active { color: var(--brand); }
.tab.active .tab-ico { background: var(--ok-bg); transform: scale(1.04); }

.scrim { position: fixed; inset: 0; z-index: 500; background: rgb(8 16 11 / .5); display: flex; align-items: flex-end; justify-content: center; }
.sheet { width: 100%; max-height: 90dvh; overflow-y: auto; background: var(--bg); border-radius: 22px 22px 0 0; padding: 20px 20px calc(24px + var(--safe-b)); display: flex; flex-direction: column; gap: 22px; box-shadow: var(--shadow-2); }
.sheet-head { display: flex; align-items: center; gap: 14px; }
.sheet-who { flex: 1; min-width: 0; }
.sheet-who h2 { font-size: 22px; }
.icon-btn { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; border: 0; background: var(--surface); transition: background var(--t-fast); }
.icon-btn:hover { background: var(--surface-2); }
.pw-form { display: flex; flex-direction: column; gap: 12px; }
.pw-form h3 { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.feedback { padding: 10px 12px; border-radius: 10px; font-size: 13px; }
.feedback.error { background: var(--danger-bg); color: var(--live); }
.feedback.success { background: var(--ok-bg); color: var(--brand); }
.signout { align-self: stretch; }

.drawer-enter-active, .drawer-leave-active { transition: opacity .22s ease; }
.drawer-enter-active .sheet, .drawer-leave-active .sheet { transition: transform .32s var(--ease); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .sheet, .drawer-leave-to .sheet { transform: translateY(40px); }

@media (min-width: 900px) {
  .shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); }
  .sidebar { display: flex; flex-direction: column; justify-content: space-between; position: sticky; top: var(--top); height: calc(100dvh - var(--top)); padding: 24px 16px; border-right: 1px solid var(--line); background: var(--bg); }
  .content { padding-bottom: 0; }
  .tabbar { display: none; }
  .scrim { align-items: stretch; justify-content: flex-end; }
  .sheet { width: 400px; max-height: none; border-radius: 0; padding: 28px 24px; }
  .drawer-enter-from .sheet, .drawer-leave-to .sheet { transform: translateX(40px); }
}
</style>
