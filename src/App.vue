<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { getSession, register, login, logout } from './storage.js'

const mode = ref('signin'), name = ref(''), email = ref(''), password = ref(''), confirmPassword = ref('')
const profile = ref(null), busy = ref(false), error = ref(''), notice = ref(''), shake = ref(false)
const card = ref(null)
async function showError(message) {
  error.value = message; shake.value = false
  await nextTick(); void card.value?.offsetWidth; shake.value = true
}
function switchMode(nextMode) {
  if (busy.value) return
  mode.value = nextMode; password.value = ''; confirmPassword.value = ''; error.value = ''; notice.value = ''; shake.value = false
}
async function submitForm() {
  if (busy.value || profile.value) return
  error.value = ''; notice.value = ''
  const normalizedEmail = email.value.trim().toLowerCase()
  const validEmail = normalizedEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  if (!validEmail) return showError('Enter a valid email address, such as alex@example.com.')
  if (mode.value === 'signup') {
    if (name.value.trim().length < 2 || name.value.trim().length > 60) return showError('Enter a name between 2 and 60 characters.')
    if (password.value.length < 8 || password.value.length > 128) return showError('Password must be between 8 and 128 characters.')
    if (password.value !== confirmPassword.value) return showError('The passwords do not match.')
  } else if (!password.value || password.value.length > 128) {
    return showError('Enter your password (up to 128 characters).')
  }
  busy.value = true
  try {
    if (mode.value === 'signup') {
      await register({ name: name.value.trim(), email: normalizedEmail, password: password.value, confirmPassword: confirmPassword.value })
      mode.value = 'signin'
      email.value = normalizedEmail
      notice.value = 'Account created. Sign in with your email and password.'
    } else {
      const result = await login({ email: normalizedEmail, password: password.value })
      profile.value = result.user
    }
    password.value = ''; confirmPassword.value = ''; shake.value = false
  } catch (err) { await showError(err.message || 'Please check your details and try again.') }
  finally { busy.value = false }
}
async function signOut() {
  busy.value = true
  try { await logout(); profile.value = null; mode.value = 'signin'; password.value = ''; notice.value = 'You have signed out.' }
  catch (err) { await showError(err.message) }
  finally { busy.value = false }
}
function focusPanel(element) { element.querySelector('[data-heading]')?.focus() }
onMounted(async () => {
  try { profile.value = (await getSession()).user }
  catch (err) { notice.value = err.message }
})
</script>

<template>
  <main class="shell">
    <aside class="intro">
      <a class="brand" href="#" @click.prevent>FORM / LAB</a>
      <div class="intro-copy"><p class="eyebrow">A QUIETER KIND OF SIGN IN</p>
        <h1>Make the<br>next step<br>feel natural.</h1>
        <p>A considered space for the work that matters.</p>
      </div>
      <p class="intro-footer">Thoughtful by design · Secure by default</p>
    </aside>
    <section class="workspace" aria-label="Account access">
      <p class="demo-label">YOUR ACCOUNT</p>
      <Transition name="panel" mode="out-in" @after-enter="focusPanel">
        <section v-if="!profile" :key="mode" class="card-shell" :class="{ 'signup-shell': mode === 'signup' }">
          <div ref="card" class="card" :class="{ 'is-error': shake }">
            <p class="eyebrow">{{ mode === 'signup' ? 'A GOOD PLACE TO BEGIN' : 'WELCOME BACK' }}</p>
            <h2 data-heading tabindex="-1">{{ mode === 'signup' ? 'Create account.' : 'Sign in.' }}</h2>
            <p class="description">{{ mode === 'signup' ? 'Set up your personal account.' : 'Enter your details to continue.' }}</p>
            <form @submit.prevent="submitForm" novalidate :aria-busy="busy">
              <fieldset :disabled="busy">
                <div v-if="mode === 'signup'" class="field"><label for="name">Full name</label>
                  <input id="name" v-model="name" type="text" autocomplete="name" placeholder="Alex Morgan" maxlength="60" required :aria-invalid="!!error" aria-describedby="form-error"></div>
                <div class="field"><label for="email">Email address</label>
                  <input id="email" v-model="email" type="email" autocomplete="email" placeholder="alex@example.com" maxlength="254" required :aria-invalid="!!error" aria-describedby="form-error"></div>
                <div class="field"><label for="password">Password</label>
                  <input id="password" v-model="password" type="password" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" placeholder="At least 8 characters" maxlength="128" required :aria-invalid="!!error" aria-describedby="password-help form-error">
                  <small id="password-help">{{ mode === 'signup' ? 'Use at least 8 characters.' : 'Your password is stored securely as a hash.' }}</small></div>
                <div v-if="mode === 'signup'" class="field"><label for="confirm-password">Confirm password</label>
                  <input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="Enter your password again" maxlength="128" required :aria-invalid="!!error" aria-describedby="form-error"></div>
                <p id="form-error" class="error-message" role="alert" aria-live="assertive">{{ error }}</p>
                <button class="primary" type="submit" :disabled="busy">
                  <span v-if="busy" class="spinner" aria-hidden="true"></span>
                  <span>{{ busy ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : (mode === 'signup' ? 'Create account' : 'Sign in') }}</span>
                  <span v-if="!busy" aria-hidden="true">→</span>
                </button>
              </fieldset>
            </form>
            <p class="switch-copy">{{ mode === 'signup' ? 'Already have an account?' : 'New here?' }}
              <button class="text-button" type="button" :disabled="busy" @click="switchMode(mode === 'signup' ? 'signin' : 'signup')">{{ mode === 'signup' ? 'Sign in' : 'Create an account' }}</button>
            </p>
          </div>
        </section>
        <section v-else key="welcome" class="card-shell">
          <div class="card welcome">
            <p class="eyebrow">YOUR PRIVATE SPACE</p><h2 data-heading tabindex="-1">Hello, {{ profile.name }}.</h2>
            <p class="description">You’re signed in and ready to continue.</p>
            <dl class="profile-details"><dt>Account email</dt><dd>{{ profile.email }}</dd></dl>
            <p class="reload-hint">Your session is securely maintained while you work.</p>
            <button class="primary" type="button" :disabled="busy" @click="signOut">{{ busy ? 'Signing out…' : 'Sign out' }} <span aria-hidden="true">↗</span></button>
          </div>
        </section>
      </Transition>
      <p class="notice" role="status">{{ notice }}</p>
      <p class="demo-note">Your password is protected with a one-way hash and is never stored in plain text.</p>
    </section>
  </main>
</template>
