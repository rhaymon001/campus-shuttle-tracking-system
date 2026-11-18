<template>
  <div class="admin-page">
    <header class="page-head rise">
      <div>
        <p class="eyebrow">People</p>
        <h1>Drivers</h1>
      </div>
      <span class="chip chip-muted"><i></i><RollNumber :value="drivers.length" />&nbsp;onboarded</span>
    </header>

    <section class="panel rise" style="--i:1">
      <div class="panel-title"><UserPlus :size="18" /><h2>Onboard a driver</h2></div>
      <div class="form-grid">
        <label class="field"><span>Full name</span><input v-model="form.name" class="input" placeholder="e.g. Malam Ibrahim Sani" autocomplete="off" /></label>
        <label class="field"><span>Email address</span><input v-model="form.email" class="input" type="email" placeholder="driver@abu.edu.ng" autocomplete="off" /></label>
        <label class="field"><span>License number</span><input v-model="form.licenseNumber" class="input mono" placeholder="e.g. KD-DRV-88231" autocomplete="off" /></label>
        <label class="field"><span>Phone number</span><input v-model="form.phoneNumber" class="input" type="tel" placeholder="e.g. 080X XXX XXXX" autocomplete="off" /></label>
        <div class="field pw">
          <label for="temp-pw">Temporary password</label>
          <input id="temp-pw" v-model="form.password" class="input mono" type="text" placeholder="Min 6 characters" autocomplete="off" />
          <PasswordFeedback :password="form.password" />
          <span class="hint">Shown in plain text so you can pass it to the driver. They can change it from their Account sheet.</span>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn" :disabled="!canSubmit || saving" @click="onboardDriver">
          <Loader2 v-if="saving" :size="16" class="spin" />{{ saving ? 'Provisioning…' : 'Onboard driver' }}
        </button>
      </div>
    </section>

    <section class="panel rise" style="--i:2">
      <div class="panel-title"><Users :size="18" /><h2>Driver roster</h2></div>

      <div v-if="loading" class="skeleton"></div>
      <div v-else-if="drivers.length === 0" class="empty"><Users :size="22" /><p>No drivers onboarded yet.</p></div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>License</th><th>Phone</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="d in drivers" :key="d._id">
              <td data-label="Name" class="strong">{{ d.userId?.name || '—' }}</td>
              <td data-label="Email">{{ d.userId?.email || '—' }}</td>
              <td data-label="License" class="mono">{{ d.licenseNumber }}</td>
              <td data-label="Phone" class="tnum">{{ d.phoneNumber || '—' }}</td>
              <td data-label="Status"><span class="chip" :class="chipFor(d.status)"><i></i>{{ formatStatus(d.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { UserPlus, Users, Loader2 } from 'lucide-vue-next';
import PasswordFeedback from '../../components/PasswordFeedback.vue';
import RollNumber from '../../components/RollNumber.vue';
import { useToast } from '../../composables/useToast';
import apiClient from '../../api/axios';

const drivers = ref([]);
const loading = ref(true);
const saving = ref(false);
const formError = ref('');
const formSuccess = ref('');

const form = reactive({ name: '', email: '', password: '', licenseNumber: '', phoneNumber: '' });

const canSubmit = computed(() =>
  form.name.trim() && form.email.trim() && form.password.length >= 6 && form.licenseNumber.trim()
);

const fetchDrivers = async (isFirstLoad = false) => {
  if (isFirstLoad) loading.value = true;
  try {
    const res = await apiClient.get('/admin/drivers');
    drivers.value = res.data;
  } catch (err) {
    console.error('Failed to fetch drivers:', err);
  } finally {
    if (isFirstLoad) loading.value = false;
  }
};

const onboardDriver = async () => {
  formError.value = '';
  formSuccess.value = '';
  saving.value = true;
  try {
    const res = await apiClient.post('/admin/drivers', {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      licenseNumber: form.licenseNumber.trim(),
      phoneNumber: form.phoneNumber.trim()
    });
    formSuccess.value = res.data.message || 'Driver onboarded successfully.';
    Object.assign(form, { name: '', email: '', password: '', licenseNumber: '', phoneNumber: '' });
    await fetchDrivers();
  } catch (err) {
    formError.value = err.response?.data?.message || 'Failed to onboard driver.';
  } finally {
    saving.value = false;
  }
};

const formatStatus = (status) => (status || 'off_duty').replace('_', ' ');
const statusBadgeClass = (status) => {
  if (status === 'on_trip') return 'badge-active';
  if (status === 'available') return 'badge-available';
  return 'badge-off';
};

onMounted(() => fetchDrivers(true));

// Form errors and confirmations appear at the top of the page as toasts, not inside the card
const toast = useToast();
watch(formError, (message) => { if (message) toast.error(message); });
watch(formSuccess, (message) => { if (message) toast.success(message); });

const chipFor = (status) => {
  if (status === 'on_trip') return 'chip-live';
  if (status === 'available') return 'chip-ok';
  return 'chip-muted';
};
</script>

<style scoped>
.pw { grid-column: 1 / -1; }
@media (min-width: 720px) { .pw { grid-column: span 2; } }
.hint { font-size: 12px; color: var(--muted); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
