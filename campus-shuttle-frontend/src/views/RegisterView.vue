<template>
  <AuthShell>
    <RegisterForm />
    <p class="auth-navigation rise" style="--i:5">
      Already have an account?
      <router-link to="/login">Login here</router-link>
    </p>
  </AuthShell>
</template>

<script setup>
import AuthShell from '../components/AuthShell.vue';
import RegisterForm from '../components/RegisterForm.vue';
</script>

<style scoped>
.auth-navigation { margin-top: 20px; font-size: 14px; color: var(--muted); }
.auth-navigation a { color: var(--brand); font-weight: 600; text-decoration: none; background: linear-gradient(var(--signal), var(--signal)) 0 100% / 100% 2px no-repeat; transition: background-size var(--t-fast) var(--ease); }
.auth-navigation a:hover { background-size: 100% 100%; color: var(--on-signal); }
</style>
