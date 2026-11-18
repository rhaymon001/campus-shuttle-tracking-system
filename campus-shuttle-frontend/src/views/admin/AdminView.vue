<template>
  <div class="admin">
    <aside class="sidebar">
      <nav class="nav" aria-label="Admin">
        <p class="eyebrow nav-label">Operations control</p>
        <router-link to="/admin" class="nav-item" exact-active-class="active"><Activity :size="18" /><span>Active trips</span></router-link>
        <router-link to="/admin/shuttles" class="nav-item" active-class="active"><Bus :size="18" /><span>Fleet</span></router-link>
        <router-link to="/admin/routes" class="nav-item" active-class="active"><Route :size="18" /><span>Routes</span></router-link>
        <router-link to="/admin/schedules" class="nav-item" active-class="active"><CalendarClock :size="18" /><span>Schedules</span></router-link>
        <router-link to="/admin/drivers" class="nav-item" active-class="active"><Users :size="18" /><span>Drivers</span></router-link>
      </nav>

      <button class="user-badge" @click="isAccountOpen = true">
        <span class="avatar">{{ initials }}</span>
        <span class="who">
          <strong>{{ authStore.user?.name || 'Administrator' }}</strong>
          <small>Account and password</small>
        </span>
        <ChevronRight :size="16" />
      </button>
    </aside>

    <div class="mobile-bar">
      <nav class="tabs" aria-label="Admin">
        <router-link to="/admin" class="tab" exact-active-class="active"><Activity :size="15" />Trips</router-link>
        <router-link to="/admin/shuttles" class="tab" active-class="active"><Bus :size="15" />Fleet</router-link>
        <router-link to="/admin/routes" class="tab" active-class="active"><Route :size="15" />Routes</router-link>
        <router-link to="/admin/schedules" class="tab" active-class="active"><CalendarClock :size="15" />Schedules</router-link>
        <router-link to="/admin/drivers" class="tab" active-class="active"><Users :size="15" />Drivers</router-link>
      </nav>
      <button class="acct" aria-label="Account" @click="isAccountOpen = true"><UserRound :size="18" /></button>
    </div>

    <div class="content">
      <router-view v-slot="{ Component, route }">
        <Transition name="view" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </div>

    <AccountSheet
      :open="isAccountOpen"
      :name="authStore.user?.name || ''"
      :role="authStore.user?.role || 'admin'"
      :form="passwordForm"
      :feedback="passwordFeedback"
      :changing="changingPassword"
      :can-submit="!!canSubmitPasswordForm"
      @close="isAccountOpen = false"
      @submit="handlePasswordChange"
      @logout="handleLogout"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Bus, Activity, Route, CalendarClock, Users, UserRound, ChevronRight } from 'lucide-vue-next';
import AccountSheet from '../../components/AccountSheet.vue';
import { useAuthStore } from '../../stores/auth';

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

const initials = computed(() => (authStore.user?.name || 'A').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''));
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
.admin { --top: calc(var(--header-h) + var(--safe-t)); min-height: calc(100dvh - var(--top)); }
.sidebar { display: none; }
.nav-label { padding: 0 12px 10px; }
.nav-item { position: relative; display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 10px; color: var(--muted); text-decoration: none; font-weight: 600; font-size: 14px; transition: color var(--t-fast), background var(--t-fast), transform var(--t-fast) var(--ease); }
.nav-item:hover { color: var(--ink); background: var(--surface-2); transform: translateX(2px); }
.nav-item.active { color: var(--brand); background: var(--ok-bg); }
.nav-item.active::before { content: ''; position: absolute; left: -16px; top: 9px; bottom: 9px; width: 4px; border-radius: 0 4px 4px 0; background: var(--signal); }
.avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--brand); color: var(--on-brand); font: 700 13px var(--font-display); }
.user-badge { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--bg); transition: border-color var(--t-fast), transform var(--t-fast) var(--ease); }
.user-badge:hover { border-color: var(--brand); transform: translateY(-1px); }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.who strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.who small { color: var(--muted); font-size: 12px; }

/* phones: scrollable tab strip + account button */
.mobile-bar { position: sticky; top: var(--top); z-index: 300; display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
.tabs { flex: 1; min-width: 0; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 28px 2px 2px; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); }
.tabs::-webkit-scrollbar { display: none; }
.tab { flex: none; display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 99px; border: 1.5px solid var(--line); color: var(--muted); text-decoration: none; font: 600 13px var(--font-body); transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast); }
.tab.active { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
.acct { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border: 1.5px solid var(--line); border-radius: 50%; background: var(--bg); }
.content { padding: 20px 16px calc(32px + var(--safe-b)); min-width: 0; }

@media (min-width: 900px) {
  .admin { display: grid; grid-template-columns: 248px minmax(0, 1fr); }
  .sidebar { display: flex; flex-direction: column; justify-content: space-between; position: sticky; top: var(--top); height: calc(100dvh - var(--top)); padding: 24px 16px; border-right: 1px solid var(--line); background: var(--bg); }
  .mobile-bar { display: none; }
  .content { padding: 32px 36px 48px; max-width: 1320px; }
}
</style>

<style>
/* Shared by every admin screen */
.admin-page { display: flex; flex-direction: column; gap: 20px; }
.admin-page .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.admin-page .page-head h1 { font-size: clamp(32px, 5vw, 46px); font-weight: 700; letter-spacing: -.04em; margin-top: 10px; }
.admin-page .page-head .chip { text-transform: none; }
.admin-page .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 20px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.admin-page .panel-title { display: flex; align-items: center; gap: 10px; }
.admin-page .panel-title h2 { font-size: 20px; letter-spacing: -.03em; }
.admin-page .panel-title svg { color: var(--brand); }
.admin-page .muted { color: var(--muted); font-size: 14px; }
.admin-page .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
.admin-page .form-actions { display: flex; }
.admin-page .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 36px 16px; text-align: center; color: var(--muted); border: 1.5px dashed var(--line); border-radius: var(--r-md); }
.admin-page .skeleton { height: 140px; border-radius: var(--r-md); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%) 0 0 / 200% 100%; animation: admin-shimmer 1.4s linear infinite; }
@keyframes admin-shimmer { to { background-position: -200% 0; } }

/* Tables: real tables on wide screens, stacked cards on phones */
.admin-page .table-wrap { overflow-x: auto; }
.admin-page .data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.admin-page .data-table th { text-align: left; font: 500 11px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding: 10px 14px; border-bottom: 1.5px solid var(--line); white-space: nowrap; }
.admin-page .data-table td { padding: 14px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.admin-page .data-table tbody tr { transition: background var(--t-fast); }
.admin-page .data-table tbody tr:hover { background: var(--bg); }
.admin-page .data-table tbody tr:last-child td { border-bottom: 0; }
.admin-page .mono { font-family: var(--font-mono); letter-spacing: .04em; }
.admin-page .strong { font-weight: 600; }
.admin-page .row-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.admin-page .mini-bar { display: block; width: 84px; height: 6px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.admin-page .mini-bar > span { display: block; height: 100%; border-radius: 99px; background: var(--brand); transition: width .8s var(--ease); }
.admin-page .mini-bar.warn > span { background: var(--signal); }
.admin-page .mini-bar.full > span { background: var(--live); }
.admin-page .occ { display: flex; align-items: center; gap: 10px; }
@media (max-width: 719px) {
  .admin-page .data-table thead { display: none; }
  .admin-page .data-table, .admin-page .data-table tbody, .admin-page .data-table tr, .admin-page .data-table td { display: block; width: 100%; }
  .admin-page .data-table tr { padding: 12px 14px; margin-bottom: 10px; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md); }
  .admin-page .data-table td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 0; border: 0; text-align: right; }
  .admin-page .data-table td::before { content: attr(data-label); flex: none; font: 500 11px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); text-align: left; }
  .admin-page .data-table td:not([data-label])::before { display: none; }
  .admin-page .data-table td.actions { justify-content: flex-end; padding-top: 12px; margin-top: 6px; border-top: 1px solid var(--line); }
  .admin-page .row-actions { justify-content: flex-end; }
}
</style>
