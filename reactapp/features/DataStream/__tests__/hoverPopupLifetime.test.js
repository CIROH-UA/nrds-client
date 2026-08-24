/**
 * The hover popup survives a click.
 *
 * It did not, and the way it failed is worth stating because nothing about it is visible in this
 * repo's own code.
 *
 * maplibre's Popup defaults to closeOnClick, and its addTo registers `map.on('click', _onClose)`.
 * react-map-gl's Popup adds the instance to the map in a useEffect with empty deps and guards
 * every subsequent update -- setLngLat included -- behind `if (popup.isOpen())`. So one click
 * closes the popup, isOpen() is false from then on, the position is never updated again, and the
 * mount effect never re-runs to re-add it. The React component keeps rendering into a container
 * that is no longer attached to the map.
 *
 * It only recovers when the component unmounts the Popup, which happens when hovered_feature
 * goes null. At zoom 7 and above the divides layer is a fill covering every pixel, so something
 * is always under the pointer and that never happens: hovering looked permanently dead for every
 * feature after the first click.
 *
 * The popup's lifetime belongs to the hover state that renders it, not to maplibre's click
 * handling, so it opts out.
 */
import { render } from '@testing-library/react';

const popupProps = [];

jest.mock('react-map-gl/maplibre', () => ({
  Popup: function Popup(props) {
    popupProps.push(props);
    return <div data-testid="popup">{props.children}</div>;
  },
}));

jest.mock('features/DataStream/components/map/HoverValue', () => function HoverValue() {
  return <div />;
});

const CustomPopUp = require('features/DataStream/components/map/Popup').default;

const hovered = {
  hoverId: 'cat-2862105',
  longitude: -111.5,
  latitude: 40.8,
  divide_id: 'cat-2862105',
  vpuid: '16',
};

beforeEach(() => {
  popupProps.length = 0;
});

describe('the hover popup', () => {
  it('does not let maplibre close it on a click', () => {
    // maplibre's default is closeOnClick: true, and react-map-gl never re-adds a closed popup.
    render(<CustomPopUp hovered_feature={hovered} enabledHovering />);

    expect(popupProps).toHaveLength(1);
    expect(popupProps[0].closeOnClick).toBe(false);
  });

  it('still renders nothing when hovering is switched off', () => {
    render(<CustomPopUp hovered_feature={hovered} enabledHovering={false} />);

    expect(popupProps).toHaveLength(0);
  });

  it('still renders nothing when there is nothing under the pointer', () => {
    // This is also the only path that unmounts the popup, which is why the bug was permanent:
    // over a catchment fill it never runs.
    render(<CustomPopUp hovered_feature={null} enabledHovering />);

    expect(popupProps).toHaveLength(0);
  });

  it('follows the pointer from one feature to the next', () => {
    const { rerender } = render(<CustomPopUp hovered_feature={hovered} enabledHovering />);

    rerender(
      <CustomPopUp
        hovered_feature={{ ...hovered, hoverId: 'cat-99', longitude: -110, latitude: 41 }}
        enabledHovering
      />
    );

    expect(popupProps.at(-1).longitude).toBe(-110);
    expect(popupProps.at(-1).latitude).toBe(41);
  });
});
