// TimeSlider.jsx
import React, { useEffect, useMemo, useRef, useCallback } from "react";
import useTimeSeriesStore from "features/DataStream/store/Timeseries";
import { formatFrameTime } from "features/DataStream/lib/utils";
import { useVPUStore } from "features/DataStream/store/VPU";
import "./TimeSlider.css";

export const TimeSlider = React.memo(() => {
  const times = useVPUStore((s) => s.times);
  const currentTimeIndex = useTimeSeriesStore((s) => s.currentTimeIndex);
  const setCurrentTimeIndex = useTimeSeriesStore((s) => s.setCurrentTimeIndex);
  const stepForward = useTimeSeriesStore((s) => s.stepForward);

  const isPlaying = useTimeSeriesStore((s) => s.isPlaying);
  const toggleIsPlaying = useTimeSeriesStore((s) => s.toggleIsPlaying);

  const playSpeed = useTimeSeriesStore((s) => s.playSpeed);
  const setPlaySpeed = useTimeSeriesStore((s) => s.setPlaySpeed);

  const baseFrameMs = useTimeSeriesStore((s) => s.baseFrameMs);

  const intervalRef = useRef(null);

  const timeSteps = Array.isArray(times) ? times.length : 0;

  const currentLabel = useMemo(
    () => (timeSteps ? formatFrameTime(times[Math.min(currentTimeIndex, timeSteps - 1)]) : ''),
    [times, currentTimeIndex, timeSteps]
  );

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isPlaying) return;
    if (!timeSteps) return;
    const ms = Math.max(1, Math.floor(baseFrameMs / Math.max(1, playSpeed)));

    intervalRef.current = setInterval(() => {
      stepForward();
    }, ms);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, baseFrameMs, timeSteps, stepForward]);

  const onSliderChange = useCallback(
    (e) => setCurrentTimeIndex(parseInt(e.target.value, 10)),
    [setCurrentTimeIndex]
  );

  const onSpeedChange = useCallback(
    (e) => setPlaySpeed(parseInt(e.target.value, 10)),
    [setPlaySpeed]
  );

  const maxIdx = Math.max(0, timeSteps - 1);
  const safeIdx = Math.min(currentTimeIndex, maxIdx);

  return (
    <div className="panel time-dock" id="timePanel">
      <div className="dock-row">
        <button
          className={`play-btn ${isPlaying ? "active" : ""}`}
          id="playBtn"
          onClick={toggleIsPlaying}
          disabled={!timeSteps}
          type="button"
          aria-label={isPlaying ? "Pause the animation" : "Play the animation"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        <input
          type="range"
          id="timeSlider"
          min="0"
          max={maxIdx}
          value={safeIdx}
          onChange={onSliderChange}
          disabled={!timeSteps}
          aria-label="Animation time"
        />

        <span className="time-value" id="currentTime">{currentLabel}</span>

        <select
          className="speed-select"
          value={playSpeed}
          onChange={onSpeedChange}
          disabled={!timeSteps}
          aria-label="Playback speed"
        >
          {[1, 2, 4, 8, 16].map((x) => (
            <option key={x} value={x}>{`${x}\u00d7`}</option>
          ))}
        </select>
      </div>
    </div>
  );
});
