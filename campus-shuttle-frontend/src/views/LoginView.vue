<template>
  <div class="auth-page">
    <LoginForm />
    <p class="auth-navigation">
      Need an account? 
      <router-link to="/register">Register here</router-link>
    </p>
  </div>
</template>

<script setup>
import LoginForm from '../components/LoginForm.vue';
</script>

<style scoped>
.auth-page { padding-top: 16px; }
.auth-navigation {
  text-align: center;
  font-size: 14px;
  color: #5F5E5A;
  margin-top: 16px;
}
.auth-navigation a {
  color: #1D9E75;
  text-decoration: none;
  font-weight: 500;
}
.auth-navigation a:hover {
  text-decoration: underline;
}
</style>