import styled, { css, keyframes } from 'styled-components';
import { Button, Form, Modal } from 'react-bootstrap';
import { FiSearch } from 'react-icons/fi';

import { NARROW_HEADER_PX } from 'features/DataStream/lib/breakpoints';

const visuallyHiddenRules = css`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

export const TimeSeriesContainer = styled.div`
  width: 100%;
  height: 300px;
  order: 1;
  flex: 1 1 80%;
  background-color: var(--panel-background);
`;

// Themed Modal wrapper - now fully CSS-variable based
/** How explanatory prose reads, wherever it appears. */
const infoProse = css`
  p,
  li {
    max-width: 68ch;
  }

  p {
    margin-bottom: 12px;
  }

  p:last-child,
  ul:last-child {
    margin-bottom: 0;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  a {
    color: var(--link-color);
    text-decoration: underline;
    text-underline-offset: 2px;
    overflow-wrap: break-word;
  }

  a:hover {
    text-decoration-thickness: 2px;
  }

  a:focus-visible {
    outline: 2px solid var(--nav-pill-active-bg);
    outline-offset: 2px;
    border-radius: 2px;
  }
`;

/** The dialog surface. */
export const ThemedModal = styled(Modal)`
  .modal-content {
    background-color: var(--modal-bg);
    color: var(--modal-text-color);
    border: 1px solid var(--modal-border-color);
    border-radius: var(--radius-md);
    box-shadow: none;
  }

  .modal-header {
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--modal-border-color);
  }

  .modal-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-strong);
    line-height: 1.3;
  }

  .modal-footer {
    border-color: var(--modal-border-color);
  }

  .modal-lg {
    max-width: min(680px, calc(100vw - 32px));
  }

  .modal-body {
    padding: 18px;
    font-size: var(--text-md);
    line-height: 1.6;
    ${infoProse}
  }
`;

/** A note that opens in place, under the control that asked for it. */
export const InfoPanel = styled.div`
  margin: 8px 0 12px;
  padding: 10px 0 0;
  border-top: 1px solid var(--panel-border-color);
  color: var(--panel-text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
  ${infoProse}

  strong {
    color: var(--text-color);
    font-weight: var(--weight-strong);
  }
`;

/** The dialog's close control. */
export const ModalCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  margin-left: auto;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background-color: transparent;
  color: var(--modal-text-color);
  cursor: pointer;

  &:hover {
    background-color: var(--nav-button-hover-bg);
  }

  &:focus-visible {
    outline: 2px solid var(--nav-pill-active-bg);
    outline-offset: 2px;
  }
`;

export const PopupContent = styled.div`
  width: 100%;
  max-width: 100%;
  padding: 8px 10px;
  background-color: var(--popup-bg);
  color: var(--popup-text-color);

  box-shadow: var(--elevation-map-readout);
  font-size: 12px;
  line-height: 1.4;

  display: flex;
  flex-direction: column;
  gap: 4px;

  .popup-title {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
  }

  .popup-row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }

  .popup-measure {
    align-items: baseline;
    padding-bottom: 4px;
    margin-bottom: 2px;
    border-bottom: 1px solid var(--panel-border-color);
    font-size: 13px;
  }

  .popup-measure .popup-value {
    font-family: var(--font-mono);
    font-weight: 650;
  }

  .popup-measure em {
    margin-left: 6px;
    font-style: normal;
    font-size: 11px;
    color: var(--panel-text-muted);
  }

  .popup-label {
    font-weight: 500;
    opacity: 0.8;
  }

  .popup-value {
    font-family: var(--font-mono);
    word-break: break-all;
  }
`;

export const Container = styled.div`
  position: absolute;
  inset: 0 auto 0 0;
  width: 400px;
  padding: 20px;
  background-color: var(--background-color);
  color: var(--map-panel-text);

  z-index: 1000;
  transition: transform 0.25s ease-out, visibility 0.25s;

  overflow-y: auto;
  visibility: ${({ $isOpen }) => ($isOpen ? 'visible' : 'hidden')};

  transform: ${({ $isOpen }) =>
    $isOpen ? 'translateX(0)' : 'translateX(-100%)'};

  @media (max-width: 768px) {
    overflow-y: ${({ $collapsed }) => ($collapsed ? 'hidden' : 'auto')};
    inset: auto 0 0 0;
    width: 100%;
    height: var(--sheet-height);
    padding: 12px 16px 16px;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    border-top: 1px solid var(--panel-border-color);
    box-shadow: var(--elevation-map-control);
    transform: ${({ $isOpen, $collapsed }) => {
      if (!$isOpen) return 'translateY(100%)';
      return $collapsed ? 'translateY(max(0px, var(--sheet-height) - var(--sheet-peek)))' : 'translateY(0)';
    }};

    h2 {
      white-space: nowrap;
      overflow: hidden;
    }
  }
`;

export const LayersContainer = styled.div`
  position: absolute;
  top: calc(var(--ts-header-height) + 16px);
  right: 10px;
  width: min(250px, calc(100vw - 32px));
  padding: 15px;
  background-color: var(--map-panel-bg);
  color: var(--map-panel-text);
  z-index: 1000;

  border-radius: var(--radius-md);
  overflow-y: auto;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    left: 8px;
    right: 8px;
    width: auto;
    max-height: calc(100dvh - var(--ts-header-height) - 32px);
  }
`;

export const LayerButton = styled(Button)`
  top: 60px;
  right: 1%;
  position: absolute;
  margin-top: 10px;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;

  background-color: ${({ $bgColor = 'var(--button-primary-bg)' }) =>
    $bgColor};
  border: none;
  color: var(--accent-text);
  border-radius: 20px;
  padding: 7px 8px;
  z-index: 1001;

  &:hover,
  &:focus {
    color: var(--hover-text);
    background-color: ${({ $bgColor = 'var(--button-primary-bg)' }) => $bgColor};
    border: none;
    box-shadow: none;
  }
`;

export const XButton = styled(Button)`
  background: var(--accent-text);
  border: 1px solid var(--panel-border-color);
  border-radius: var(--radius-sm);
  color: var(--primary-color);
  padding: 7px 8px;
  width: 100%;
  min-height: 44px;
  z-index: 1001;
  box-shadow: none;

  &:hover:not(:disabled),
  &:focus:not(:disabled) {
    background-color: var(--button-primary-hover-bg);
    color: var(--button-primary-text-hover);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** A panel-level statement that something is missing. */
export const Notice = styled.p`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--panel-border-color);
  border-radius: 6px;
  background-color: var(--status-failed-bg);
  color: var(--status-failed-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 1.35;
`;

export const SButton = styled(Button)`
  border: none;
  color: var(--accent-text);
  background-color: ${({ $active }) => ($active ? 'var(--button-primary-hover-bg)' : 'transparent')};
  z-index: 1001;
  border-radius: 20px;
  &:hover,
  &:focus {
    background-color: var(--button-primary-hover-bg); ;
    color: var(--button-primary-text-hover);
    border: none;
    box-shadow: none;
  }
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

/** Anything that floats over the map. */
const MapSurface = styled.div`
  position: absolute;
  z-index: 1000;
  border: 1px solid var(--panel-border-color);
  border-radius: var(--radius-md);
  background-color: var(--map-panel-bg);
  color: var(--map-panel-text);
  box-shadow: var(${(p) => (p.$control ? '--elevation-map-control' : '--elevation-map-readout')});
`;

/** Where the time slider sits once it is a map control rather than a panel one. */
export const TimeSliderDock = styled(MapSurface).attrs({ $control: true })`
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(28px + var(--sheet-offset, 0px));
  transition: bottom 0.25s ease-out;
  width: min(680px, calc(100vw - 32px));
  padding: 6px 10px;
  pointer-events: auto;
  touch-action: manipulation;
`;

/** The line under a panel's heading. */
export const PanelCaption = styled.p`
  margin: calc(var(--space-xs) * -1) 0 var(--space-sm) 26px;
  font-size: var(--text-xs);
  color: var(--panel-text-muted);
`;

/** A prompt on the map, for when the view itself is why nothing is drawn. */
export const MapHint = styled(MapSurface).attrs({ as: 'button' })`
  left: 50%;
  transform: translateX(-50%);
  bottom: ${(p) => (p.$raised ? '150px' : '28px')};
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 8px 18px;
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-align: left;
  cursor: pointer;

  &:hover {
    background-color: var(--button-primary-hover-bg);
  }

  &:focus-visible {
    outline: 2px solid var(--nav-pill-active-bg);
    outline-offset: 2px;
  }
`;

/* A label, not a heading. Uppercase with tracking at weight 650 is the house style of every
   generated dashboard, and it made a passive caption shout louder than the controls beside it. */
export const LegendTitle = styled.div`
  margin-bottom: 6px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--panel-text-muted);
`;

export const LegendBar = styled.div`
  height: 8px;
  border-radius: var(--radius-sm);
`;

export const LegendScale = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--panel-text-muted);

  > span:nth-child(2) {
    transform: translateX(-50%);
    margin-left: 50%;
    position: absolute;
  }
`;

/** The load status pill. */
export const StatusStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 1.2;
  flex: 0 1 auto;
  min-width: 0;

  > span {
    min-width: 0;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    > span {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  @media (max-width: 640px) {
    padding: 4px;

    > span:not(:only-child) {
      ${visuallyHiddenRules}
    }
  }
  color: ${({ $failed }) =>
    $failed ? 'var(--status-failed-text)' : 'var(--status-text)'};
  background-color: ${({ $failed }) =>
    $failed ? 'var(--status-failed-bg)' : 'var(--status-bg)'};

  .spinner-border {
    border-width: 2px;
  }

  @media (max-width: 768px) {
    max-width: 45vw;
    font-size: 0.85rem;
    padding: 4px 10px;
  }
`;

export const Row = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 6px 0;
  margin-bottom: 2px;
  font-size: 13px;
`;

export const IconLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-wrap: break-word;
  font-size: ${({ $fontSize }) => ($fontSize ? `${$fontSize}px` : 'var(--text-sm)')};
  font-weight: var(--weight-medium);
  margin: 0 0 4px;
  color: var(--accent-text);
`;

export const Title = styled.span`
  letter-spacing: 0.0125em;
  font-weight: var(--weight-strong);
  font-size: var(--text-md);
  line-height: 1.4;
  margin: 0;
  align-items: center;
`;

/** The layer toggles. */
export const Switch = styled(Form.Switch)`
  min-height: 44px;
  display: flex;
  align-items: center;

  .form-check-input {
    width: 34px;
    height: 18px;
    cursor: pointer;
    background-color: var(--switch-inactive);
    border-radius: var(--radius-pill);
    box-shadow: none;
  }

  .form-check-input:checked {
    background-color: var(--switch-active);
    border-color: var(--switch-inactive);

  }

  .form-check-input:focus {
    box-shadow: none;
    border-color: var(--switch-inactive);
  }
`;

/** Everything below the sheet's peek row, taken out of the tab order while collapsed. */
export const CollapsibleRegion = styled.div`
  @media (max-width: 768px) {
    visibility: ${({ $collapsed }) => ($collapsed ? 'hidden' : 'visible')};
  }
`;

export const Content = styled.div`
  padding: 14px 16px 18px;
  border-block-end: 1px solid var(--panel-border-color);

  &:last-of-type {
    border-block-end: none;
  }

  & + & {
    padding-top: 20px;
  }

  a {
    color: var(--link-color);
  }
`;

export const MapContainer = styled.div`
  flex: 1 1 100%;
  order: 1;
  width: 100%;
  overflow-y: hidden;
  height: 100%;

  .maplibregl-popup-content {
    padding: 0px;
  }
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

export const FieldsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  row-gap: 8px;
`;

export const FieldBlock = styled.div``;

export const FieldLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-text);
`;

export const FieldValue = styled.div`
  font-size: 12px;
  font-weight: 500;
`;

export const SearchBarWrapper = styled.div`
  display: flex;
  align-items: center;
  flex: 1 1 200px;
  min-width: 0;
  padding: 6px 10px;

  @media (max-width: 768px) {
    min-height: 44px;
    min-width: 190px;
  }

  @media (max-width: 560px) {
    min-width: 150px;
  }

  @media (max-width: ${NARROW_HEADER_PX}px) {
    min-width: 96px;
    padding: 6px 6px;
  }
  border-radius: 6px;
  background-color: var(--search-bg);
  box-sizing: border-box;
  border: 1px solid var(--search-border);
`;

/** What stands in for the search box when the index could not be loaded. */
export const SearchNotice = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(46rem, 100%);
  padding: 6px 12px;
  border: 1px solid var(--panel-border-color);
  border-radius: var(--radius-sm);
  background-color: var(--status-failed-bg);
  color: var(--status-failed-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);

  > span {
    min-width: 0;
    white-space: normal;
  }

  > button {
    flex: none;
    min-height: 32px;
    padding: 2px 10px;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    background-color: transparent;
    color: inherit;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  > button:hover {
    background-color: var(--nav-button-hover-bg);
  }

  > button:focus-visible {
    outline: 2px solid var(--nav-pill-active-bg);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    > span {
      white-space: normal;
    }
  }
`;

export const SearchIcon = styled(FiSearch)`
  flex-shrink: 0;
  margin-right: 8px;
  color: var(--muted-text);
  font-size: 16px;

  @media (max-width: 560px) {
    display: none;
  }
`;

/** The submit control's text, traded for its icon where the row cannot spare the width. */
export const SearchButtonLabel = styled.span`
  @media (max-width: 560px) {
    display: none;
  }
`;

export const SearchSubmitIcon = styled(FiSearch)`
  display: none;

  @media (max-width: 560px) {
    display: block;
    font-size: 16px;
  }
`;

export const SearchInput = styled.input`
  border: none;
  flex: 1 1 auto;
  min-width: 0;
  align-self: stretch;
  font-size: var(--text-md);
  background: transparent;
  color: ${({ $notFound }) =>
    $notFound ? 'var(--status-failed-text)' : 'var(--search-text)'};

  outline: none;
  &:focus-visible {
    box-shadow: inset 0 0 0 2px var(--nav-pill-active-bg);
    border-radius: 3px;
  }

  &::placeholder {
    color: var(--search-placeholder);
  }

  @media (max-width: ${NARROW_HEADER_PX}px) {
    &::placeholder {
      font-size: 0.8rem;
    }
  }

  &:disabled {
    cursor: default;
  }
`;

// The search wrapper is a flex row, so this sits at its end without disturbing the input.
export const SearchButton = styled.button`
  flex-shrink: 0;
  margin-left: 8px;
  padding: 2px 10px;

  @media (max-width: 768px) {
    min-height: 36px;
    padding: 2px 12px;
  }

  @media (max-width: 560px) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    padding: 2px 8px;
  }
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--status-text);
  background-color: var(--status-bg);

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &:not(:disabled):hover {
    filter: brightness(1.25);
  }
`;

export const ViewContainer = styled.div`
  flex: 1 1 auto;
  position: relative;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const ChartContainer = styled.div`
  position: relative;
  border-radius: 10px;
  overflow: hidden;
`;

export const NoData = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-style: italic;
  font-size: 1rem;
  color: var(--chart-empty-text-color, #6b7280);
`;
/** Present to a screen reader, absent to everyone else. */
export const VisuallyHidden = styled.h1`
  ${visuallyHiddenRules}
  margin: -1px;
  padding: 0;
  border: 0;
`;

/** The first thing a keyboard reaches, and only then. */
export const SkipLink = styled.a`
  position: absolute;
  left: var(--space-sm);
  top: -100%;
  z-index: 2000;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  background: var(--nav-pill-active-bg);
  color: var(--nav-pill-active-text-color);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-decoration: none;

  &:focus {
    top: var(--space-sm);
  }
`;

/** A standing property of the product, worn beside its name. */
export const ExperimentalBadge = styled.span`
  flex: 0 0 auto;
  padding: 1px var(--space-sm);
  border: 1px solid var(--notice-border);
  border-radius: var(--radius-pill);
  background-color: var(--notice-bg);
  color: var(--notice-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 1.5;
  white-space: nowrap;
  @media (max-width: 560px) {
    padding: 2px 8px;
    font-size: 0.65rem;
    letter-spacing: 0;
  }
`;

/** The badge's full word, traded for its short form where the row cannot spare the width. */
export const BadgeFull = styled.span`
  @media (max-width: ${NARROW_HEADER_PX}px) {
    display: none;
  }
`;

export const BadgeShort = styled.span`
  display: none;

  @media (max-width: ${NARROW_HEADER_PX}px) {
    display: inline;
  }
`;

/** The full word as real text, since aria-label on a generic span is not honoured. */
export const BadgeAssistive = styled.span`
  display: none;

  @media (max-width: ${NARROW_HEADER_PX}px) {
    display: inline;
    ${visuallyHiddenRules}
  }
`;

/** The label on a block within a panel. */
export const PanelSectionHeading = styled.h3`
  margin: var(--space-md) 0 var(--space-xs);
  font-size: var(--text-xs);
  font-weight: var(--weight-strong);
  color: var(--panel-text-muted);
`;

/** A line across the top of the map while the app is working. */
const slide = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(400%); }
`;

const pulse = keyframes`
  50% { opacity: 0.35; }
`;

export const LoadProgressBar = styled.div`
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  z-index: 1200;
  overflow: hidden;
  pointer-events: none;
  background-color: color-mix(in oklab, var(--nav-pill-active-bg) 18%, transparent);

  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 25%;
    background-color: var(--nav-pill-active-bg);
    animation: ${slide} 1.1s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      width: 100%;
      animation: ${pulse} 2.4s cubic-bezier(0.25, 1, 0.5, 1) infinite;
    }
  }
`;
