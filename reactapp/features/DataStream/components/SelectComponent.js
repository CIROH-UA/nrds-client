import React, { Component, useMemo } from 'react';
import Select, { createFilter } from 'react-select';
import { FixedSizeList as List } from 'react-window';

const ROW_HEIGHT = 28;
const LIST_STYLE = { overflowX: "hidden" };

const Row = React.memo(function Row({ index, style, data }) {
  return <div style={style}>{data.children[index]}</div>;
});

const MenuList = React.memo(function MenuList(props) {
  const { options, children, maxHeight, getValue } = props;

  const childArray = useMemo(() => React.Children.toArray(children), [children]);
  const itemCount = childArray.length;

  // Compute initial scroll offset based on selected option
  const initialOffset = useMemo(() => {
    const [value] = getValue();
    const selected = value?.value;
    const idx = Math.max(0, options.findIndex((o) => o.value === selected));
    return idx * ROW_HEIGHT;
  }, [getValue, options]);

  const adjustedHeight = useMemo(
    () => Math.min(itemCount * ROW_HEIGHT, maxHeight),
    [itemCount, maxHeight]
  );

  const itemData = useMemo(() => ({ children: childArray }), [childArray]);

  return (
    <List
      height={adjustedHeight}
      itemCount={itemCount}
      itemSize={ROW_HEIGHT}
      initialScrollOffset={initialOffset}
      style={LIST_STYLE}
      itemData={itemData}
    >
      {Row}
    </List>
  );
});

const customStyles = (width = 150) => {
  return {
    container: (base) => ({
      ...base,
      width,
      fontSize: 12,
    }),
    control: (base, state) => ({
      ...base,
      minHeight: 28,
      height: 28,
      fontSize: 12,
      borderRadius: 4,
      paddingTop: 0,
      paddingBottom: 0,
      backgroundColor: 'var(--select-control-bg)',
      borderColor: state.isFocused
        ? '#2684ff'
        : 'var(--select-control-border)',
      boxShadow: state.isFocused ? '0 0 0 1px #2684ff' : 'none',
      '&:hover': {
        borderColor: '#2684ff',
      },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 6px',
    }),
    indicatorsContainer: (base) => ({
      ...base,
      height: 28,
    }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: '0 4px',
    }),
    clearIndicator: (base) => ({
      ...base,
      padding: '0 4px',
    }),
    singleValue: (base) => ({
      ...base,
      color: 'var(--select-text-color)',
      maxWidth: '100%',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
    input: (base) => ({
      ...base,
      color: 'var(--select-text-color)',
      margin: 0,
      padding: 0,
    }),
    placeholder: (base) => ({
      ...base,
      fontSize: 12,
      color: 'var(--select-placeholder-color)',
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      overflowY: 'auto',
      fontSize: 12,
      backgroundColor: 'var(--select-menu-bg)',
    }),
    menuList: (base) => ({
      ...base,
      paddingTop: 0,
      paddingBottom: 0,
    }),
    option: (base, state) => ({
      ...base,
      fontSize: 12,
      padding: '4px 8px',
      width: '100%',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      color: state.isSelected ? '#ffffff' : 'var(--select-text-color)',
      backgroundColor: state.isSelected
        ? 'var(--select-option-selected-bg)'
        : state.isFocused
        ? 'var(--select-option-hover-bg)'
        : 'var(--select-menu-bg)',
    }),
  };
};

const SelectComponent = ({
  optionsList,
  onChangeHandler,
  value,
  width = 150,
}) => {

  const components = useMemo(() => ({ MenuList }), []);

  const styles = useMemo(() => customStyles(width), [width]);
  const filterOption = useMemo(
    () => createFilter({ ignoreAccents: false }),
    []
  );

  return (
    <Select
      components={components}
      styles={styles}
      filterOption={filterOption}
      options={optionsList}
      value={value}
      onChange={onChangeHandler}
      menuPortalTarget={document.body}
      menuShouldScrollIntoView={false}
      menuPosition="fixed"
    />
  );
};

export default React.memo(SelectComponent);
