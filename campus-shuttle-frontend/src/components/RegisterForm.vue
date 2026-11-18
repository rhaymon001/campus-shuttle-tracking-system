<template>
  <div class="form-wrap">
    <p class="eyebrow rise" style="--i:1">Student registration</p>
    <h2 class="rise" style="--i:2">Create your account</h2>
    <p class="subtitle rise" style="--i:3">One account for live tracking, queues and pre-booking.</p>

    <div v-if="serverError" class="banner banner-danger" role="alert">
      <AlertTriangle :size="16" />
      <span>{{ serverError }}</span>
    </div>
    <div v-if="successMessage" class="banner banner-ok" role="status">
      <CheckCircle2 :size="16" />
      <span>{{ successMessage }}</span>
    </div>

    <form @submit="onSubmit" class="form-layout rise" style="--i:4" novalidate>
      <div class="field">
        <label for="name">Full name</label>
        <div class="input-wrapper">
          <User :size="16" class="input-icon" />
          <input id="name" v-model="name" class="input" type="text" autocomplete="name" placeholder="e.g., John Doe" :class="{ 'has-error': errors.name }" />
        </div>
        <span class="error-msg" role="alert">{{ errors.name }}</span>
      </div>

      <div class="field">
        <label for="email">ABU student email</label>
        <div class="input-wrapper">
          <Mail :size="16" class="input-icon" />
          <input id="email" v-model="email" class="input" type="email" autocomplete="email" placeholder="username@gmail.com" :class="{ 'has-error': errors.email }" />
        </div>
        <span class="error-msg" role="alert">{{ errors.email }}</span>
      </div>

      <div class="two-up">
        <div class="field">
          <label for="studentId">Matric number</label>
          <div class="input-wrapper">
            <Hash :size="16" class="input-icon" />
            <input id="studentId" v-model="studentId" class="input mono" type="text" placeholder="U12CS1001" :class="{ 'has-error': errors.studentId }" />
          </div>
          <span class="error-msg" role="alert">{{ errors.studentId }}</span>
        </div>

        <div class="field">
          <label for="phone">Phone number</label>
          <div class="input-wrapper">
            <Phone :size="16" class="input-icon" />
            <input id="phone" v-model="phone" class="input mono" type="tel" inputmode="numeric" autocomplete="tel" placeholder="08012345678" :class="{ 'has-error': errors.phone }" />
          </div>
          <span class="error-msg" role="alert">{{ errors.phone }}</span>
        </div>
      </div>

      <div class="field">
        <label for="password">Password</label>
        <PasswordInput id="password" v-model="password" autocomplete="new-password" placeholder="Minimum 6 characters" :has-error="!!errors.password" />
        <PasswordFeedback :password="password || ''" />
        <span class="error-msg" role="alert">{{ password ? '' : errors.password }}</span>
      </div>

      <button type="submit" :disabled="isSubmitting" class="btn submit">
        <Loader2 v-if="isSubmitting" :size="16" class="spin" />
        <span>{{ isSubmitting ? 'Creating account…' : 'Create account' }}</span>
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useForm, useField } from 'vee-validate';
import * as yup from 'yup';
import { User, Mail, Hash, Phone, Lock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-vue-next';
import PasswordInput from './PasswordInput.vue';
import PasswordFeedback from './PasswordFeedback.vue';
import { useAuthStore } from '../stores/auth';
import router from '../router';

const authStore = useAuthStore();
const serverError = ref('');
const successMessage = ref('');

const validationSchema = yup.object({
  name: yup.string().required('Full name is required').min(3, 'Name must be at least 3 characters'),
  email: yup.string().required('Email address is required').email('Must be a valid email format'),
  studentId: yup.string().required('Matriculation number is required').matches(/^U\d{2}[A-Z]{2}\d{4}$/, 'Invalid format (e.g., U12CS1001)'),
  phone: yup.string().required('Phone number is required').matches(/^\d{11}$/, 'Phone number must be exactly 11 digits'),
  password: yup.string().required('Password is required').min(6, 'Password must be at least 6 characters long')
});

const { handleSubmit, errors, isSubmitting, resetForm } = useForm({ validationSchema });

const { value: name } = useField('name');
const { value: email } = useField('email');
const { value: studentId } = useField('studentId');
const { value: phone } = useField('phone');
const { value: password } = useField('password');

const onSubmit = handleSubmit(async (values) => {
  serverError.value = '';
  successMessage.value = '';
  try {
    const result = await authStore.registerStudent(values);
    successMessage.value = result.message || 'Registration successfully recorded!';
    resetForm();
    router.push("/login")
  } catch (err) {
    serverError.value = err || 'Connection dropped during submission.';
  }
});
</script>

<style scoped>
h2 { font-size: 40px; font-weight: 700; letter-spacing: -.035em; margin: 10px 0 8px; }
.subtitle { color: var(--muted); margin-bottom: 24px; }
.form-layout { display: flex; flex-direction: column; gap: 2px; }
.two-up { display: grid; grid-template-columns: 1fr; gap: 2px 14px; }
@media (min-width: 520px) { .two-up { grid-template-columns: 1fr 1fr; } }
label { font: 600 12px var(--font-body); color: var(--muted); }
.input-wrapper { position: relative; display: flex; align-items: center; }
.input-icon { position: absolute; left: 14px; color: var(--stale); pointer-events: none; }
.input { padding-left: 42px; }
.input.mono { font-family: var(--font-mono); font-size: 14px; letter-spacing: .02em; }
.input-wrapper:focus-within .input-icon { color: var(--brand); }
.error-msg { font-size: 12px; color: var(--live); min-height: 18px; }
.submit { width: 100%; margin-top: 6px; min-height: 48px; font-size: 15px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.banner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 14px; margin-bottom: 18px; line-height: 1.4; animation: rise .35s var(--ease); }
.banner svg { flex: none; margin-top: 2px; }
.banner-danger { background: var(--danger-bg); color: var(--live); box-shadow: inset 3px 0 0 var(--live); }
.banner-ok { background: var(--ok-bg); color: var(--brand); box-shadow: inset 3px 0 0 var(--brand); }
</style>
