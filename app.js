const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const statusEl = document.getElementById('status');
const durationChip = document.getElementById('durationChip');
const effectsGrid = document.getElementById('effectsGrid');

let audioContext;
let mediaRecorder;
let recordedChunks = [];
let audioBuffer;
let activeStream;

const effects = [
  {
    id: 'clean',
    title: 'Natural voice',
    description: 'Listen back without changes to confirm your take.',
    tag: 'Baseline',
  },
  {
    id: 'bright',
    title: 'Bright boost',
    description: 'Adds clarity with a gentle high-shelf filter.',
    tag: 'Clarity',
  },
  {
    id: 'robot',
    title: 'Robot pulse',
    description: 'Amplitude modulation gives a metallic pulse.',
    tag: 'Synthetic',
  },
  {
    id: 'echo',
    title: 'Echo chamber',
    description: 'Adds delay feedback for spacey repeats.',
    tag: 'Space',
  },
  {
    id: 'telephone',
    title: 'Lo-fi call',
    description: 'Narrow band-pass for a vintage phone vibe.',
    tag: 'Vintage',
  },
  {
    id: 'underwater',
    title: 'Underwater',
    description: 'Deep low-pass filter with softened highs.',
    tag: 'Filtered',
  },
  {
    id: 'chipmunk',
    title: 'Chipmunk',
    description: 'Faster playback lifts the pitch for playful energy.',
    tag: 'Fast',
  },
  {
    id: 'slow',
    title: 'Slow & low',
    description: 'Stretched playback for a darker mood.',
    tag: 'Slow',
  },
];

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function updateStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function toggleEffectButtons(enabled) {
  const buttons = effectsGrid.querySelectorAll('button[data-effect]');
  buttons.forEach((button) => {
    button.disabled = !enabled;
  });
}

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return 'No recording yet';
  return `${seconds.toFixed(2)}s available`;
}

function buildEffectsUI() {
  const fragment = document.createDocumentFragment();

  effects.forEach((effect) => {
    const card = document.createElement('article');
    card.className = 'effect-card';

    const title = document.createElement('h3');
    title.textContent = effect.title;

    const desc = document.createElement('p');
    desc.textContent = effect.description;

    const footer = document.createElement('div');
    footer.className = 'effect-footer';

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = effect.tag;

    const playButton = document.createElement('button');
    playButton.className = 'button';
    playButton.textContent = 'Play';
    playButton.disabled = true;
    playButton.dataset.effect = effect.id;

    playButton.addEventListener('click', () => playEffect(effect.id));

    footer.append(tag, playButton);
    card.append(title, desc, footer);
    fragment.appendChild(card);
  });

  effectsGrid.appendChild(fragment);
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateStatus('Your browser does not support microphone capture.', 'error');
    return;
  }

  ensureAudioContext();

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];

    mediaRecorder = new MediaRecorder(activeStream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      durationChip.textContent = formatDuration(audioBuffer.duration);
      toggleEffectButtons(true);
      updateStatus('Recording captured. Pick an effect to play it back.', 'success');
    };

    mediaRecorder.start();
    recordButton.disabled = true;
    stopButton.disabled = false;
    toggleEffectButtons(false);
    updateStatus('Recording… press stop when you are done.');
  } catch (error) {
    console.error(error);
    updateStatus('Unable to access the microphone. Please allow permission.', 'error');
    cleanupStream();
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  cleanupStream();
  recordButton.disabled = false;
  stopButton.disabled = true;
  updateStatus('Processing your take…');
}

function cleanupStream() {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
}

function createDelayEffect(ctx, inputNode) {
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const delay = ctx.createDelay(5.0);
  const feedback = ctx.createGain();

  delay.delayTime.value = 0.25;
  feedback.gain.value = 0.35;
  wet.gain.value = 0.65;
  dry.gain.value = 0.9;

  inputNode.connect(dry);
  dry.connect(output);

  inputNode.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(output);

  return { inputNode, outputNode: output };
}

function createRobotEffect(ctx, inputNode) {
  const modulatedGain = ctx.createGain();
  modulatedGain.gain.value = 0.6;
  const modulator = ctx.createOscillator();
  const modDepth = ctx.createGain();

  modulator.frequency.value = 18;
  modDepth.gain.value = 0.4;

  modulator.connect(modDepth);
  modDepth.connect(modulatedGain.gain);

  inputNode.connect(modulatedGain);
  modulator.start();

  const stop = () => {
    try { modulator.stop(); } catch (e) { /* already stopped */ }
  };

  return { inputNode, outputNode: modulatedGain, stop };
}

function createFilterEffect(ctx, inputNode, type, frequency, q = 1, gain = 0) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  filter.gain.value = gain;
  inputNode.connect(filter);
  return { inputNode, outputNode: filter };
}

function getEffectChain(ctx, effectId, sourceNode) {
  const inputNode = ctx.createGain();
  sourceNode.connect(inputNode);

  switch (effectId) {
    case 'bright':
      return createFilterEffect(ctx, inputNode, 'highshelf', 3200, 0.7, 5);
    case 'robot':
      return createRobotEffect(ctx, inputNode);
    case 'echo':
      return createDelayEffect(ctx, inputNode);
    case 'telephone':
      return createFilterEffect(ctx, inputNode, 'bandpass', 1200, 1.4);
    case 'underwater':
      return createFilterEffect(ctx, inputNode, 'lowpass', 420, 0.9);
    default:
      return { inputNode, outputNode: inputNode };
  }
}

async function playEffect(effectId) {
  if (!audioBuffer) {
    updateStatus('Record something first, then pick an effect.', 'error');
    return;
  }

  ensureAudioContext();

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  if (effectId === 'chipmunk') {
    source.playbackRate.value = 1.25;
  } else if (effectId === 'slow') {
    source.playbackRate.value = 0.85;
  }

  const chain = getEffectChain(audioContext, effectId, source);

  chain.outputNode.connect(audioContext.destination);
  source.start();

  source.onended = () => {
    source.disconnect();
    chain.outputNode.disconnect();
    if (chain.stop) chain.stop();
  };

  updateStatus(`Playing: ${effects.find((e) => e.id === effectId)?.title ?? 'Effect'}`);
}

function wireControls() {
  recordButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
}

function init() {
  buildEffectsUI();
  wireControls();
}

init();
