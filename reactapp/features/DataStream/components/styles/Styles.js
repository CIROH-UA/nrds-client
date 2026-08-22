import styled, { css } from 'styled-components';
import { Button, Form, Modal } from 'react-bootstrap';
import { FiSearch } from 'react-icons/fi';

export const TimeSeriesContainer = styled.div`
  width: 100%;
  height: 300px;
  order: 1;
  flex: 1 1 80%;
  background-color: var(--panel-background);
`;

// Themed Modal wrapper - now fully CSS-variable based
/**
 * How explanatory prose reads, wherever it appears.
 *
 * Shared by the one remaining dialog and by the notes that open inline, so the same paragraph
 * does not get two different treatments depending on which container it landed in.
 */
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
    /* These are urls and file names: they have no spaces to break at. */
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

/**
 * The dialog surface.
 *
 * It floats over the basemap, which is the one case the flat-shell rule allows a shadow for:
 * the surface underneath is arbitrary imagery, so tonal layering cannot separate them.
 *
 * The body scrolls rather than the dialog growing past the viewport. The longest of these
 * dialogs is a page of prose and a six-item list, which on a short window ran off the bottom
 * with no way to reach the end.
 */
export const ThemedModal = styled(Modal)`
  .modal-content {
    background-color: var(--modal-bg);
    color: var(--modal-text-color);
    border: 1px solid var(--modal-border-color);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  .modal-header {
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--modal-border-color);
  }

  /* Styled here rather than through styled(Modal.Title): styled-components claims the "as"
     prop for itself, so styled(Modal.Title) with as="h2" rendered a bare h2 and never called
     Modal.Title at all, quietly dropping its class. */
  .modal-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-strong);
    line-height: 1.3;
  }

  .modal-footer {
    border-color: var(--modal-border-color);
  }

  /* Height is bootstrap's job here: the dialog is rendered scrollable, which sizes the body
     against the viewport. A max-height of our own fought that and capped it short on tall
     windows. */
  .modal-body {
    padding: 18px;
    font-size: var(--text-md);
    line-height: 1.6;
    ${infoProse}
  }
`;

/**
 * A note that opens in place, under the control that asked for it.
 *
 * These were dialogs. Explaining what a layer is, while covering the layer, with a scrim over
 * the map the explanation is about, meant dismissing the answer to look at the thing. Opening
 * in place keeps both on screen, and costs no focus trap, no backdrop and no escape handling.
 *
 * It scrolls rather than pushing the panel it sits in out of shape: the layer note is four
 * links and a paragraph inside a 250px overlay.
 */
export const InfoPanel = styled.div`
  margin: 8px 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--panel-border-color);
  border-radius: 6px;
  background-color: var(--panel-background);
  color: var(--panel-text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
  max-height: 40vh;
  overflow-y: auto;
  ${infoProse}

  strong {
    color: var(--text-color);
    font-weight: var(--weight-strong);
  }
`;

/**
 * The dialog's close control.
 *
 * Outside the title, deliberately. It lived inside Modal.Title, which is the element
 * aria-labelledby points at, so the dialog announced itself as "Layer Information ✕".
 */
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

  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
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

  /* The headline reading, set apart from the feature's own attributes below it. The time is
     part of the label because the number is one step of the forecast, not the forecast. */
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
  top: calc(var(--ts-header-height));
  left: 0;
  height: calc(100% - var(--ts-header-height));
  width: 400px;
  padding: 20px;
  background-color: var(--background-color);
  color: var(--map-panel-text);

  z-index: 1000;
  transition: transform 0.25s ease-out;

  overflow-y: auto;

  transform: ${({ $isOpen }) =>
    $isOpen ? 'translateX(0)' : 'translateX(-100%)'};

  @media (max-width: 768px) {
    width: 100%;
    border-radius: 0;
    transform: ${({ $isOpen }) =>
      $isOpen ? 'translateX(0)' : 'translateX(-100%)'};
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
  /* Named, not "all": this container changes width at the 768px breakpoint, and "all" put that
     width change on the transition. */
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    width: 100%;
    border-radius: 0;
  }
`;

export const LayerButton = styled(Button)`
  top: 60px;
  right: 1%;
  position: absolute;
  margin-top: 10px;
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
  /* Was a --border-color fallback of #2a3a4a with a --radius-sm fallback of 4px. Neither token
     existed, so both fell back and a dark navy border rendered in the light theme too. Both are
     defined now, and this uses the panel border the rest of the app uses. */
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
    box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .3), 0 1px 3px 1px rgba(60, 64, 67, .15);
  }

  /* Pressing it could only ever fail when there is nothing to read, so it says so by feel as
     well as by the notice above it. */
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/**
 * A panel-level statement that something is missing.
 *
 * The empty state it replaces was a bare <p>No Outputs Available</p> in the panel's text flow,
 * which read as a caption rather than as the reason the Update button cannot do anything.
 */
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
  background-color: transparent;
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

// Sits in the header, so it must stay compact and never push the search bar around. Failure is
// styled from last_error rather than by matching the message text. The colours come from the
// theme because the header is white in one and navy in the other -- a single hardcoded grey
// measured 1.38:1 against the dark one, which is why nothing could be read.
/**
 * A prompt on the map, for when the view itself is why nothing is drawn.
 *
 * A button rather than a notice: telling someone to zoom in and making them find the control
 * are different things, and the whole complaint was that the data could not be located.
 */
/**
 * Where the time slider sits once it is a map control rather than a panel one.
 *
 * Bottom centre, because it drives the animation and belongs near it rather than in a panel the
 * reader has to look away to reach. That slot already had MapHint in it, and the two appear
 * under overlapping conditions -- a vpu loaded with flowpaths on, before the reader has zoomed
 * in far enough for the reaches to be mapped -- so MapHint is raised above this rather than left
 * to collide with it.
 *
 * Shrinks rather than hides on a narrow screen. LegendBox answers that case with display: none,
 * which it can afford because it only explains a ramp; this is the only control that scrubs
 * time, so hiding it would take the animation away with it.
 *
 * pointer-events are on, unlike the legend: it is a control. The box is bounded so it only takes
 * the map interaction underneath itself. touch-action is set because maplibre claims drag
 * gestures on its container, and without it the thumb is not reliably draggable on a touchscreen.
 */
/**
 * Anything that floats over the map.
 *
 * The legend, the zoom hint and the time slider each carried their own copy of this: the same
 * border, the same background, the same radius and the same box-shadow, written out three times.
 * Three copies of one card is why they read as interchangeable, and it is also why the shadow
 * was wrong everywhere at once -- pure black at 25%, invisible against the dark panel and heavy
 * against the light one.
 *
 * Elevation is a prop rather than part of the recipe, because these are not equally important.
 * The slider is the control the reader operates; the legend and the hint only report.
 */
const MapSurface = styled.div`
  position: absolute;
  z-index: 1000;
  border: 1px solid var(--panel-border-color);
  border-radius: var(--radius-md);
  background-color: var(--map-panel-bg);
  color: var(--map-panel-text);
  box-shadow: var(${(p) => (p.$control ? '--elevation-map-control' : '--elevation-map-readout')});
`;

export const TimeSliderDock = styled(MapSurface).attrs({ $control: true })`
  left: 50%;
  transform: translateX(-50%);
  bottom: 28px;
  width: min(560px, calc(100vw - 32px));
  padding: 6px 10px;
  pointer-events: auto;
  touch-action: manipulation;
`;

export const MapHint = styled(MapSurface).attrs({ as: 'button' })`
  left: 50%;
  transform: translateX(-50%);
  /* Above the time slider when it is docked, in its usual place when it is not. */
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

/**
 * The colour key for the animated flowpaths.
 *
 * Bottom right: bottom left is where the forecast panel sits, which covered it entirely, and the
 * layer panel opens at the top right. Raised clear of the attribution bar. Small on purpose: it
 * explains one ramp, and the map is the thing being read.
 */
export const LegendBox = styled(MapSurface)`
  right: 10px;
  bottom: 42px;
  width: 190px;
  padding: 8px 10px;
  pointer-events: none;

  /* Narrower on a phone, not absent. This used to be display:none, which left the animation
     running in six colours with nothing on screen to say what they meant -- and the slider that
     drives it stayed, so the one control the reader had was the one they could not interpret. */
  @media (max-width: 768px) {
    width: 140px;
    bottom: 96px;
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
  /* Tabular figures rather than a second typeface; the ticks only have to stop shifting. */
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--panel-text-muted);

  /* The middle label is the ramp's midpoint, not the range's, so it is centred over the bar. */
  > span:nth-child(2) {
    transform: translateX(-50%);
    margin-left: 50%;
    position: absolute;
  }
`;

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
  /* 0 0: it must not shrink. With flex-shrink allowed the pill was handed 209px for a 34
     character message and clipped it silently, which is the same defect as the ellipsis with
     the evidence removed. The search box shrinks instead. */
  flex: 0 0 auto;

  /* Shown whole, on one line. This clipped mid-word first ("Loading feature p"), then truncated
     with an ellipsis, and a message whose entire job is to name what is missing is no use
     ending in dots: "No streamflow data for cat-28..." does not say which catchment. The
     longest message in the app is 54 characters, which at this size is about 430px including
     the spinner, and the header has room for it once the search box stops claiming the row.
     One line also keeps the navbar at its 56px min-height, which matters because the panels are
     positioned against --ts-header-height rather than against the navbar itself. */
  > span {
    min-width: 0;
    white-space: nowrap;
  }

  /* Narrow viewports have no room for either, so the message wraps and the header grows with
     it. Below this width the panels are full-width anyway. */
  @media (max-width: 768px) {
    > span {
      white-space: normal;
      overflow-wrap: break-word;
    }
  }
  color: ${({ $failed }) =>
    $failed ? 'var(--status-failed-text)' : 'var(--status-text)'};
  background-color: ${({ $failed }) =>
    $failed ? 'var(--status-failed-bg)' : 'var(--status-bg)'};

  /* The spinner draws itself in currentColor, so it follows the text. */
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
  padding: 6px 0;
  margin-bottom: 2px;
  font-size: 13px;
`;

export const IconLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ $fontSize }) => ($fontSize ? `${$fontSize}px` : 'var(--text-sm)')};
  font-weight: var(--weight-medium);
  /* Explicit, because this renders as a heading in places and would inherit h2 margins. */
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

export const Switch = styled(Form.Switch)`
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

export const Content = styled.div`
  padding: 14px 16px 18px;
  border-block-end: 1px solid var(--panel-border-color);

  /* No rule under the final section. It used to be dropped from the first one instead, which
     left the panel ending on a hanging divider. */
  &:last-of-type {
    border-block-end: none;
  }

  /* Rhythm: sections after the first breathe a little more, so the panel reads as grouped
     regions rather than one uniform stack. */
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
  /* Yields rather than claiming the row. width: 100% made this take the whole header line and
     squeeze the status message into a 213px column, where it wrapped to three lines and grew
     the navbar to 80px while the panels stayed pinned to --ts-header-height at 56px. */
  flex: 0 1 400px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 6px;
  background-color: var(--search-bg);
  box-sizing: border-box;
  border: 1px solid var(--search-border);
`;

/**
 * What stands in for the search box when the index could not be loaded.
 *
 * A disabled box with a placeholder would be the smaller change, but a control that can never
 * work is worse than no control: it invites typing and then swallows it. This says why, and
 * offers the retry, because the usual cause is one failed fetch of a 103 MB file rather than
 * anything permanent.
 */
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

  /* Wraps rather than running on. Every message is short by construction now, but nowrap made
     the header's width the only limit, so one long one took the retry button off the screen.
     Wrapping and not clipping, because a reason cut in half is worse than a taller pill. */
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
`;

export const SearchInput = styled.input`
  border: none;
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--text-md);
  background: transparent;
  color: ${({ $notFound }) =>
    $notFound ? 'var(--status-failed-text)' : 'var(--search-text)'};

  /* A visible ring rather than outline: none. Keyboard users had no indication of focus in
     the app's most-used control. Drawn inside so it cannot widen the header. */
  outline: none;
  &:focus-visible {
    box-shadow: inset 0 0 0 2px var(--nav-pill-active-bg);
    border-radius: 3px;
  }

  &::placeholder {
    color: var(--search-placeholder);
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
  /* Takes the space the header and the banner leave, rather than a full 100% underneath them.
     min-height: 0 so the map can shrink inside the column instead of forcing it taller. */
  flex: 1 1 auto;
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