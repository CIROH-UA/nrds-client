// TimeSlider.jsx
import React, { useEffect, useMemo, useRef, useCallback } from "react";
import useTimeSeriesStore from "features/DataStream/store/Timeseries";
import "./TimeSlider.css";

export const TimeSlider = () => {
  const series = useTimeSeriesStore((s) => s.series);
  const currentTimeIndex = useTimeSeriesStore((s) => s.currentTimeIndex);
  const setCurrentTimeIndex = useTimeSeriesStore((s) => s.setCurrentTimeIndex);

  const stepForward = useTimeSeriesStore((s) => s.stepForward);
  const stepBackward = useTimeSeriesStore((s) => s.stepBackward);

  const isPlaying = useTimeSeriesStore((s) => s.isPlaying);
  const toggleIsPlaying = useTimeSeriesStore((s) => s.toggleIsPlaying);

  const playSpeed = useTimeSeriesStore((s) => s.playSpeed);
  const setPlaySpeed = useTimeSeriesStore((s) => s.setPlaySpeed);

  const baseFrameMs = useTimeSeriesStore((s) => s.baseFrameMs);

  const intervalRef = useRef(null);

  const timeSteps = Array.isArray(series) ? series.length : 0;

  const currentLabel = useMemo(() => {
    console.log("Calculating currentLabel");
    if (!timeSteps) return "T+0h";
    const t0 = series?.[0]?.x;
    const t = series?.[currentTimeIndex]?.x;
    if (typeof t0 !== "object" || typeof t !== "object") return "T+0h";
    const hours = Math.round((t - t0) / 3600000); // ms -> hours
    return `T+${hours}h`;
  }, [series, currentTimeIndex, timeSteps]);

  // Keep index in range if series changes
  useEffect(() => {
    if (!timeSteps) return;
    if (currentTimeIndex > timeSteps - 1) setCurrentTimeIndex(timeSteps - 1);
  }, [timeSteps, currentTimeIndex, setCurrentTimeIndex]);

  // Start/stop autoplay
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
    <div className="panel" id="timePanel">
      <h3 className="panel-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Time Control
      </h3>

      <div className="time-control">
        <div className="time-display">
          <span className="time-label">Current Time</span>
          <span className="time-value" id="currentTime">{currentLabel}</span>
        </div>

        <input
          type="range"
          id="timeSlider"
          min="0"
          max={maxIdx}
          value={safeIdx}
          onChange={onSliderChange}
          disabled={!timeSteps}
        />
      </div>

      <div className="play-controls">
        <button
          className={`play-btn ${isPlaying ? "active" : ""}`}
          id="playBtn"
          onClick={toggleIsPlaying}
          disabled={!timeSteps}
          type="button"
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

        <button className="play-btn" onClick={stepBackward} disabled={!timeSteps} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
            <line x1="5" y1="19" x2="5" y2="5" />
          </svg>
        </button>

        <button className="play-btn" onClick={stepForward} disabled={!timeSteps} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
            <line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>
      </div>

      <div className="speed-control">
        <label htmlFor="speed-slider">Speed</label>
        <input
          type="range"
          id="speed-slider"
          min="1"
          max="20"
          value={playSpeed}
          onChange={onSpeedChange}
        />
        <span className="speed-value" id="speed-value">{playSpeed}x</span>
      </div>
    </div>
  );
};
