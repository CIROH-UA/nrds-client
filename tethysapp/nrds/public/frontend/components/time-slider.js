/**
 * The animation time slider for the build-less NRDS client (migration unit U5a), the vanilla
 * replacement for the React TimeSlider. `createTimeSlider(container, store)` builds a docked
 * transport -- a play/pause button, a range input over the VPU frames, the current time label, and
 * a speed control -- into `container`, drives the shared clock through the store's actions, and
 * returns a teardown that unsubscribes, clears the play interval, and removes its DOM.
 *
 * The clock lives in the store (currentTimeIndex, isPlaying, playSpeed, baseFrameMs). This view
 * only reflects it and calls the actions: the range writes setCurrentTimeIndex, the button calls
 * toggleIsPlaying, the speed control calls setPlaySpeed, and while playing a setInterval whose
 * delay is baseFrameMs/playSpeed calls stepForward so the flowpath colouring advances a frame at a
 * time. A store subscription keeps every control in step with external clock changes (a load that
 * stops playback, a chart hover, another view), and the dock shows only while there are frames.
 */
import { actions } from '../store/app-store.js';
import { formatFrameTime } from '../lib/utils.js';
import { createSelect } from './select.js';

/** The range input's maximum index: one less than the frame count, never below zero. */
export function sliderMax(length) {
  return Math.max(0, (Number(length) || 0) - 1);
}

/** A frame index clamped into the current range; a non-number reads as 0. */
export function clampIndex(index, length) {
  const max = sliderMax(length);
  const n = Number(index);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

/**
 * The interval delay for a play speed, in milliseconds: the base frame time divided by the speed,
 * floored, and never below 1ms. Matches the React slider's `baseFrameMs / max(1, playSpeed)`.
 */
export function frameDelayMs(baseFrameMs, playSpeed) {
  const base = Number(baseFrameMs) || 0;
  const speed = Math.max(1, Number(playSpeed) || 1);
  return Math.max(1, Math.floor(base / speed));
}

const SPEED_OPTIONS = [1, 2, 4, 8, 16].map((x) => ({ value: x, label: `${x}×` }));

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' +
  '<polygon points="5 3 19 12 5 21 5 3"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' +
  '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

/** Build the time slider into `container`, wired to `store`; returns a teardown. */
export function createTimeSlider(container, store) {
  const root = document.createElement('div');
  root.className = 'panel time-dock';

  const row = document.createElement('div');
  row.className = 'dock-row';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'play-btn';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'time-slider';
  slider.min = '0';
  slider.step = '1';
  slider.setAttribute('aria-label', 'Animation time');

  const timeValue = document.createElement('span');
  timeValue.className = 'time-value';

  const speedHost = document.createElement('div');
  speedHost.className = 'speed-select-host';

  row.append(playBtn, slider, timeValue, speedHost);
  root.append(row);
  container.append(root);

  const speed = createSelect({
    container: speedHost,
    options: SPEED_OPTIONS,
    value: store.get().timeseries.playSpeed,
    compact: true,
    label: 'Playback speed',
    onChange: (opt) => actions.setPlaySpeed(opt.value),
  });

  let intervalId = null;
  let prevPlaying = null;
  let prevSpeed = null;
  let prevBaseMs = null;
  let prevFrames = null;

  const clearPlayInterval = () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  /** Start, stop, or re-time the play interval to match the current clock state. */
  const manageInterval = (ts, frames) => {
    const playing = Boolean(ts.isPlaying) && frames > 0;
    if (
      playing === prevPlaying &&
      ts.playSpeed === prevSpeed &&
      ts.baseFrameMs === prevBaseMs &&
      frames === prevFrames
    ) {
      return;
    }
    prevPlaying = playing;
    prevSpeed = ts.playSpeed;
    prevBaseMs = ts.baseFrameMs;
    prevFrames = frames;

    clearPlayInterval();
    if (!playing) return;
    intervalId = setInterval(() => actions.stepForward(), frameDelayMs(ts.baseFrameMs, ts.playSpeed));
  };

  const render = () => {
    const ts = store.get().timeseries;
    const frames = store.get().vpu.times.length;

    // The dock is on the map only while there is something to animate.
    root.hidden = frames === 0;

    const max = sliderMax(frames);
    const idx = clampIndex(ts.currentTimeIndex, frames);
    const disabled = frames === 0;

    slider.max = String(max);
    if (slider.value !== String(idx)) slider.value = String(idx);
    slider.disabled = disabled;

    playBtn.disabled = disabled;
    playBtn.classList.toggle('active', Boolean(ts.isPlaying));
    playBtn.innerHTML = ts.isPlaying ? PAUSE_ICON : PLAY_ICON;
    playBtn.setAttribute('aria-label', ts.isPlaying ? 'Pause the animation' : 'Play the animation');

    timeValue.textContent = formatFrameTime(store.get().vpu.times[idx]);

    speed.setValue(ts.playSpeed);

    manageInterval(ts, frames);
  };

  const onSliderInput = (event) => actions.setCurrentTimeIndex(parseInt(event.target.value, 10));
  const onPlayClick = () => actions.toggleIsPlaying();

  slider.addEventListener('input', onSliderInput);
  playBtn.addEventListener('click', onPlayClick);

  const unsubscribe = store.subscribe(() => render());
  render();

  return () => {
    unsubscribe();
    clearPlayInterval();
    slider.removeEventListener('input', onSliderInput);
    playBtn.removeEventListener('click', onPlayClick);
    speed.destroy();
    root.remove();
  };
}

export default createTimeSlider;
