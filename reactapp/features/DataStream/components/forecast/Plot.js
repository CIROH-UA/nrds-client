import React, { useCallback, useMemo, useEffect, useRef, useId } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { LinePath, Line } from '@visx/shape';
import { extent, bisector } from 'd3-array';
import { GridRows, GridColumns } from '@visx/grid';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { GlyphCircle } from '@visx/glyph';
import { timeFormat } from 'd3-time-format';
import { RectClipPath } from '@visx/clip-path';
import { getVariableUnits } from '../../lib/data';
import useDataStreamStore from '../../store/Datastream';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';


const MARGIN = Object.freeze({ top: 40, right: 20, bottom: 30, left: 50 });

/** -------------------- Static SVG layer (no tooltip props) -------------------- */
const StaticSvgLayer = React.memo(function StaticSvgLayer({
  width,
  height,
  margin,
  innerWidth,
  innerHeight,
  clipId,

  // colors/theme
  axisLabelColor,
  axisStrokeColor,
  axisTickColor,
  axisTickTextColor,
  gridColor,
  colors,

  // label + scales
  yAxisLabel,
  xScale,
  yScale,
  xTickValues,
  formatDate,

  // series + accessors
  data,
  getDate,
  getYValue,

  // memoized axis props
  axisLabelProps,
  leftTickLabelProps,
  bottomTickLabelProps,
}) {
  return (
    <svg width={width} height={height} style={{ cursor: 'crosshair' }}>
      {yAxisLabel && (
        <text x={10} y={10} fontSize={12} fontWeight={600} fill={axisLabelColor}>
          {yAxisLabel}
        </text>
      )}

      <RectClipPath id={clipId} x={0} y={0} width={innerWidth} height={innerHeight} />

      <Group left={margin.left} top={margin.top}>
        {/* <GridRows
          scale={yScale}
          width={innerWidth}
          height={innerHeight}
          stroke={gridColor}
          strokeOpacity={0.25}
          strokeWidth={1}
        />
        <GridColumns
          scale={xScale}
          width={innerWidth}
          height={innerHeight}
          stroke={gridColor}
          strokeOpacity={0.25}
          strokeWidth={1}
        /> */}

        <AxisLeft
          scale={yScale}
          labelProps={axisLabelProps}
          stroke={axisStrokeColor}
          tickStroke={axisTickColor}
          tickLabelProps={leftTickLabelProps}
        />

        <AxisBottom
          scale={xScale}
          top={innerHeight}
          labelProps={axisLabelProps}
          stroke={axisStrokeColor}
          tickFormat={formatDate}
          tickStroke={axisTickColor}
          tickLabelProps={bottomTickLabelProps}
          tickValues={xTickValues}
        />

        <Group clipPath={`url(#${clipId})`}>
          {data.map((series, index) => (
            <LinePath
              key={`line-${index}`}
              stroke={colors[index % colors.length]}
              strokeWidth={2.2}
              data={series.data}
              x={(d) => xScale(getDate(d)) ?? 0}
              y={(d) => yScale(getYValue(d)) ?? 0}
            />
          ))}
        </Group>
      </Group>
    </svg>
  );
});

/** -------------------- Tooltip SVG layer (crosshair + glyphs only) -------------------- */
const TooltipSvgLayer = React.memo(function TooltipSvgLayer({
  margin,
  innerHeight,
  clipId,
  tooltipData,
  tooltipLeft,
  xScale,
  yScale,
  getDate,
  getYValue,
  crosshairColor,
  glyphStrokeColor,
  colors,
}) {
  if (!tooltipData) return null;

  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <Group left={margin.left} top={margin.top} clipPath={`url(#${clipId})`}>
        {/* Crosshair */}
        <Line
          from={{ x: tooltipLeft - margin.left, y: 0 }}
          to={{ x: tooltipLeft - margin.left, y: innerHeight }}
          stroke={crosshairColor}
          strokeWidth={1.5}
          strokeDasharray="6,3"
        />

        {/* Glyphs */}
        {tooltipData.map((d, i) => (
          <GlyphCircle
            key={`glyph-${i}`}
            left={xScale(getDate(d.dataPoint)) ?? 0}
            top={yScale(getYValue(d.dataPoint)) ?? 0}
            size={110}
            fill={colors[d.seriesIndex % colors.length]}
            stroke={glyphStrokeColor}
            strokeWidth={2}
          />
        ))}
      </Group>
    </svg>
  );
});

const LineChart = React.memo(function LineChart({ width, height, data, layout }) {
  const forecast = useDataStreamStore((s) => s.forecast);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    const unsub = useTimeSeriesStore.subscribe((s) => {
      isPlayingRef.current = !!s.isPlaying;
    });

    isPlayingRef.current = !!useTimeSeriesStore.getState().isPlaying;
    return () => { unsub?.(); };
  }, []);

  const clipId = useId(); // avoids collisions if multiple charts
  const overlayRef = useRef(null);

  // --- theme vars ---
  const screenWidth = window.innerWidth;
  const fontSize = screenWidth <= 1300 ? 13 : 18;
  const fontWeight = screenWidth <= 1300 ? 600 : 500;

  const rootStyles = getComputedStyle(document.documentElement);
  const axisLabelColor =
    rootStyles.getPropertyValue('--chart-axis-label-color').trim() || '#111827';
  const axisStrokeColor =
    rootStyles.getPropertyValue('--chart-axis-stroke-color').trim() || '#111827';
  const axisTickColor =
    rootStyles.getPropertyValue('--chart-axis-tick-color').trim() || '#111827';
  const axisTickTextColor =
    rootStyles.getPropertyValue('--chart-axis-tick-text-color').trim() || '#111827';
  const gridColor =
    rootStyles.getPropertyValue('--chart-grid-color').trim() || '#e5e7eb';
  const tooltipBg =
    rootStyles.getPropertyValue('--chart-tooltip-bg').trim() || 'rgba(255, 255, 255, 0.95)';
  const tooltipTextColor =
    rootStyles.getPropertyValue('--chart-tooltip-text').trim() || '#111827';
  const tooltipBorderColor =
    rootStyles.getPropertyValue('--chart-tooltip-border-color').trim() ||
    'rgba(148, 163, 184, 0.6)';
  const crosshairColor =
    rootStyles.getPropertyValue('--chart-crosshair-color').trim() || '#4b5563';
  const glyphStrokeColor =
    rootStyles.getPropertyValue('--chart-glyph-stroke-color').trim() || '#ffffff';
  const noDataTextColor =
    rootStyles.getPropertyValue('--chart-empty-text-color').trim() || '#6b7280';

  const lineColorsVar = rootStyles.getPropertyValue('--chart-line-colors').trim();
  const colors = useMemo(
    () =>
      lineColorsVar
        ? lineColorsVar.split(/\s*,\s*/)
        : ['#1d4ed8', '#f97316', '#16a34a', '#dc2626', '#7c3aed'],
    [lineColorsVar]
  );

  // axis props (stable references)
  const axisLabelProps = useMemo(
    () => ({
      style: { fill: axisLabelColor, fontSize, fontWeight },
    }),
    [axisLabelColor, fontSize, fontWeight]
  );

  const leftTickLabelProps = useCallback(
    () => ({
      fill: axisTickTextColor,
      fontSize: 12,
      fontWeight: 500,
      textAnchor: 'end',
    }),
    [axisTickTextColor]
  );

  const bottomTickLabelProps = useCallback(
    () => ({
      fill: axisTickTextColor,
      fontSize: 12,
      fontWeight: 500,
      textAnchor: 'middle',
    }),
    [axisTickTextColor]
  );

  const yAxisLabel = useMemo(() => {
    const yaxisValue = layout?.yaxis || '';
    if (!yaxisValue) return '';
    const units = getVariableUnits(yaxisValue);
    return units ? `${yaxisValue} (${units})` : yaxisValue;
  }, [layout?.yaxis]);

  const { tooltipData, tooltipLeft = 0, tooltipTop = 0, showTooltip, hideTooltip } =
    useTooltip();

  const margin = MARGIN;
  const innerWidth = Math.max(1, width - margin.left - margin.right);
  const innerHeight = Math.max(1, height - margin.top - margin.bottom);

  const EST_LABEL_PX = 100;
  const xNumTicks = Math.max(2, Math.floor(innerWidth / EST_LABEL_PX));

  const getDate = useCallback((d) => (d?.x instanceof Date ? d.x : new Date(d?.x)), []);
  const getYValue = useCallback((d) => d?.y, []);

  const safeExtent = useCallback((arr, accessor, fallback = [0, 1]) => {
    const [min, max] = extent(arr, accessor);
    return min == null || max == null ? fallback : [min, max];
  }, []);

  const allData = useMemo(() => data.flatMap((s) => s.data ?? []), [data]);
  const hasData = allData.length > 0;

  const { xScale, yScale } = useMemo(() => {
    const x = scaleTime({
      range: [0, innerWidth],
      domain: safeExtent(allData, getDate, [new Date(), new Date()]),
    });

    const y = scaleLinear({
      range: [innerHeight, 0],
      domain: safeExtent(allData, getYValue, [0, 1]),
      nice: true,
    });

    return { xScale: x, yScale: y };
  }, [allData, innerWidth, innerHeight, safeExtent, getDate, getYValue]);

  const xTickValues = useMemo(() => xScale.ticks(xNumTicks), [xScale, xNumTicks]);

  const tooltipStyles = useMemo(
    () => ({
      ...defaultStyles,
      minWidth: 60,
      backgroundColor: tooltipBg,
      color: tooltipTextColor,
      fontSize: 14,
      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25)',
      borderRadius: 6,
      border: `1px solid ${tooltipBorderColor}`,
      padding: '8px 10px',
    }),
    [tooltipBg, tooltipTextColor, tooltipBorderColor]
  );

  const formatDate = useCallback(
    (date) => {
      const fmt = forecast === 'short_range' ? '%H:%M' : '%m/%d';
      return timeFormat(fmt)(date);
    },
    [forecast]
  );

  const formatTooltipDate = useMemo(() => timeFormat('%Y-%m-%d %H:%M:%S'), []);
  const bisectDate = useMemo(() => bisector((d) => getDate(d)).left, [getDate]);

  const formatYValue = useCallback((val) => {
    return val == null || Number.isNaN(val) ? '-' : val.toFixed(2);
  }, []);

  const lastTooltipKeyRef = useRef('');

  const buildTooltipAtDate = useCallback(
    (x0, leftPx) => {
      const tooltipDataArray = [];
      // const indices = [];
      const keyParts = [];

      data.forEach((series, seriesIndex) => {
        const seriesData = series.data ?? [];
        if (!seriesData.length) return;

        const index = bisectDate(seriesData, x0, 1);
        // indices.push(index);

        const d0 = seriesData[index - 1];
        const d1 = seriesData[index];
        let d = d0;
        if (d1 && getDate(d1)) {
          d = x0 - getDate(d0) > getDate(d1) - x0 ? d1 : d0;
        }

        if (d) {
          tooltipDataArray.push({ dataPoint: d, seriesIndex, seriesLabel: series.label });
          // key by *actual selected point*, not bisect index (prevents equal-data new-object updates)
          keyParts.push(`${seriesIndex}:${+getDate(d)}:${getYValue(d) ?? ''}`);
        }
      });

      if (!tooltipDataArray.length) return;

      
      
      // Only re-show when selected points change (not pixels / object identity)
      const key = keyParts.join('|');
      if (key === lastTooltipKeyRef.current) return;
      lastTooltipKeyRef.current = key;

      // compute top from y positions (static yScale)
      const yPositions = tooltipDataArray.map((d) => yScale(getYValue(d.dataPoint)));
      const top = Math.min(...yPositions) + margin.top;

      showTooltip({ tooltipData: tooltipDataArray, tooltipLeft: leftPx, tooltipTop: top });
    },
    [data, bisectDate, getDate, getYValue, yScale, margin.top, showTooltip]
  );

  const snapToNearestDate = useCallback(
    (seriesData, x0) => {
      if (!seriesData?.length) return x0;
      let idx = bisectDate(seriesData, x0, 1);
      idx = Math.max(1, Math.min(idx, seriesData.length - 1));
      const d0 = seriesData[idx - 1];
      const d1 = seriesData[idx];
      const t0 = getDate(d0);
      const t1 = getDate(d1);
      return x0 - t0 > t1 - x0 ? t1 : t0;
    },
    [bisectDate, getDate]
  );

  const handleTooltip = useCallback(
    (event) => {
      if (!hasData || isPlayingRef.current) return;
      const point = localPoint(event);
      if (!point) return;

      const xInPlot = point.x - margin.left;
      const x0 = xScale.invert(xInPlot);

      const refSeries = data[0]?.data ?? [];
      const xSnapped = snapToNearestDate(refSeries, x0);

      const xPx = xScale(xSnapped);
      if (xPx == null) return;

      const leftPx = margin.left + xPx;
      buildTooltipAtDate(xSnapped, leftPx);
    },
    [hasData, margin.left, xScale, data, snapToNearestDate, buildTooltipAtDate]
  );

  const playSyncRef = useRef(null);
  useEffect(() => {
    playSyncRef.current = {
      hasData,
      allData,
      xScale,
      getDate,
      marginLeft: margin.left,
      buildTooltipAtDate,
    };
  }, [hasData, allData, xScale, getDate, margin.left, buildTooltipAtDate]);

  useEffect(() => {
    const sync = (state) => {
      const r = playSyncRef.current;
      if (!r?.hasData || !state.isPlaying) return;
      const d = r.allData?.[state.currentTimeIndex];
      if (!d) return;
      const x0 = r.getDate(d);
      const xPx = r.xScale(x0);
      if (xPx == null) return;
      r.buildTooltipAtDate(x0, r.marginLeft + xPx);
    };

    // initial sync (in case we're already playing)
    sync(useTimeSeriesStore.getState());

    const unsub = useTimeSeriesStore.subscribe((state, prev) => {
      if (
        state.isPlaying === prev.isPlaying &&
        state.currentTimeIndex === prev.currentTimeIndex
      ) return;
      sync(state);
    });
    return () => { unsub?.()};
  }, []);

  const noData = !hasData;

  return (
    <div style={{ position: 'relative', width, height, borderRadius: 10, overflow: 'hidden' }}>
      {noData ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontStyle: 'italic',
            fontSize: '1rem',
            color: noDataTextColor,
          }}
        >
          🛠 No data to display
        </div>
      ) : (
        <>
          {/* STATIC layer (won't rerender on tooltip changes) */}
          <StaticSvgLayer
            width={width}
            height={height}
            margin={margin}
            innerWidth={innerWidth}
            innerHeight={innerHeight}
            clipId={clipId}
            axisLabelColor={axisLabelColor}
            axisStrokeColor={axisStrokeColor}
            axisTickColor={axisTickColor}
            axisTickTextColor={axisTickTextColor}
            gridColor={gridColor}
            colors={colors}
            yAxisLabel={yAxisLabel}
            xScale={xScale}
            yScale={yScale}
            xTickValues={xTickValues}
            formatDate={formatDate}
            data={data}
            getDate={getDate}
            getYValue={getYValue}
            axisLabelProps={axisLabelProps}
            leftTickLabelProps={leftTickLabelProps}
            bottomTickLabelProps={bottomTickLabelProps}
          />

          {/* TOOLTIP svg layer (rerenders only when tooltip changes) */}
          <TooltipSvgLayer
            margin={margin}
            innerHeight={innerHeight}
            clipId={clipId}
            tooltipData={tooltipData}
            tooltipLeft={tooltipLeft}
            xScale={xScale}
            yScale={yScale}
            getDate={getDate}
            getYValue={getYValue}
            crosshairColor={crosshairColor}
            glyphStrokeColor={glyphStrokeColor}
            colors={colors}
          />

          {/* interaction overlay (captures mouse events) */}
          <svg
            width={width}
            height={height}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <Group left={margin.left} top={margin.top}>
              <rect
                ref={overlayRef}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                onMouseMove={handleTooltip}
                onMouseLeave={() => {
                  lastTooltipKeyRef.current = '';
                  hideTooltip();
                }}
                onTouchMove={handleTooltip}
                onTouchEnd={() => {
                  lastTooltipKeyRef.current = '';
                  hideTooltip();
                }}
                style={{ cursor: 'crosshair', pointerEvents: 'all' }}
              />
            </Group>
          </svg>

          {/* HTML tooltip (rerenders only when tooltip changes) */}
          {tooltipData && (
            <TooltipWithBounds top={tooltipTop} left={tooltipLeft} style={tooltipStyles}>
              <div style={{ marginBottom: 4 }}>
                <strong>Date: </strong>
                {formatTooltipDate(getDate(tooltipData[0].dataPoint))}
              </div>
              {tooltipData.map((d, i) => (
                <div key={`tooltip-${i}`}>
                  <strong style={{ color: colors[d.seriesIndex % colors.length] }}>
                    {d.seriesLabel}:{' '}
                  </strong>
                  {formatYValue(getYValue(d.dataPoint))}
                </div>
              ))}
            </TooltipWithBounds>
          )}
        </>
      )}
    </div>
  );
});

export default LineChart;
