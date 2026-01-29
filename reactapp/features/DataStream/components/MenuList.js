import React, { useMemo, useContext } from "react";
import { FixedSizeList as List } from "react-window";

const ROW_HEIGHT = 28;

// Context used to pass react-select's innerProps to the react-window outer element
const OuterElementContext = React.createContext({});

const OuterElementType = React.forwardRef(function OuterElementType(props, ref) {
  const outerProps = useContext(OuterElementContext);
  return <div ref={ref} {...props} {...outerProps} />;
});

const Row = React.memo(function Row({ index, style, data }) {
  // data is an array of react-select option elements
  return <div style={style}>{data[index]}</div>;
});

function MenuListInner (props) {
  const { options, children, maxHeight, getValue, innerRef, innerProps } = props;

  const childArray = useMemo(() => React.Children.toArray(children), [children]);
  const itemCount = childArray.length;

  // compute initial scroll offset
  const initialOffset = useMemo(() => {
    const [value] = getValue();
    const selected = value?.value;
    const idx = Math.max(0, options.findIndex((o) => o.value === selected));
    return idx * ROW_HEIGHT;
  }, [getValue, options]);

  const height = useMemo(
    () => Math.min(itemCount * ROW_HEIGHT, maxHeight),
    [itemCount, maxHeight]
  );

  return (
    <OuterElementContext.Provider value={innerProps}>
      <List
        height={height}
        itemCount={itemCount}
        itemSize={ROW_HEIGHT}
        itemData={childArray}
        initialScrollOffset={initialOffset}
        outerElementType={OuterElementType}
        outerRef={innerRef}          // IMPORTANT: react-select wants the ref on the scroll container
        width="100%"
      >
        {Row}
      </List>
    </OuterElementContext.Provider>
  );
}


const areEqualMenuList = (prev, next) => {
  // compare list geometry/content drivers
  if (prev.maxHeight !== next.maxHeight) return false;
  if (prev.options !== next.options) return false; // assumes optionsList is stable ref (recommended)
  if (React.Children.count(prev.children) !== React.Children.count(next.children)) return false;

  const prevSel = prev.getValue?.()?.[0]?.value;
  const nextSel = next.getValue?.()?.[0]?.value;
  if (prevSel !== nextSel) return false;

  // compare only stable a11y fields from innerProps (ignore function identity churn)
  const p = prev.innerProps || {};
  const n = next.innerProps || {};
  return (
    p.id === n.id &&
    p.role === n.role &&
    p["aria-multiselectable"] === n["aria-multiselectable"]
  );
};
MenuListInner.whyDidYouRender = true;

export const MenuList = React.memo(MenuListInner, areEqualMenuList);
