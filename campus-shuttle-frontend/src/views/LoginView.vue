<template>
  <AuthShell>
    <LoginForm />
    <p class="auth-navigation rise" style="--i:5">
      Need an account?
      <router-link to="/register">Register here</router-link>
    </p>
  </AuthShell>
</template>

<script setup>
import AuthShell from '../components/AuthShell.vue';
import LoginForm from '../components/LoginForm.vue';
</script>

<style scoped>
.auth-navigation { margin-top: 24px; font-size: 14px; color: var(--muted); }
.auth-navigation a { color: var(--brand); font-weight: 600; text-decoration: none; background: linear-gradient(var(--signal), var(--signal)) 0 100% / 100% 2px no-repeat; transition: background-size var(--t-fast) var(--ease); }
.auth-navigation a:hover { background-size: 100% 100%; color: var(--on-signal); }
</style>
