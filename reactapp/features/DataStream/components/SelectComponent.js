import React, { Component, useMemo } from 'react';
import Select, { createFilter } from 'react-select';
import { FixedSizeList as List } from 'react-window';
import PropTypes from 'prop-types';

const ROW_HEIGHT = 28;
const LIST_STYLE = { overflowX: "hidden" };

const Row = React.memo(function Row({ index, style, data }) {
  return <div style={style}>{data.children[index]}</div>;
});

const MenuList = React.memo(function MenuList(props) {
  const { options, children, maxHeight, getValue } = props;

  const childArray = useMemo(() => React.Children.toArray(children), [children]);
  const itemCount = childArray.length;

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
      minHeight: 44,
      height: 44,
      fontSize: 'var(--text-sm)',
      borderRadius: 4,
      paddingTop: 0,
      paddingBottom: 0,
      backgroundColor: 'var(--select-control-bg)',
      borderColor: state.isFocused
        ? 'var(--nav-pill-active-bg)'
        : 'var(--select-control-border)',
      boxShadow: state.isFocused ? '0 0 0 2px var(--nav-pill-active-bg)' : 'none',
      '&:hover': {
        borderColor: 'var(--nav-pill-active-bg)',
      },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 6px',
    }),
    indicatorsContainer: (base) => ({
      ...base,
      height: 44,
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
      whiteSpace: 'normal',
      overflowWrap: 'break-word',
      color: state.isSelected ? 'var(--nav-pill-active-text-color)' : 'var(--select-text-color)',
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
  inputId,
  isLoading = false,
}) => {

  const components = useMemo(() => ({ MenuList }), []);

  const styles = useMemo(() => customStyles(width), [width]);
  const filterOption = useMemo(
    () => createFilter({ ignoreAccents: false }),
    []
  );
  const onChange = React.useCallback(
    (opt) => onChangeHandler(opt),
    [onChangeHandler]
  );
  return (
    <Select
      inputId={inputId}
      components={components}
      styles={styles}
      filterOption={filterOption}
      options={optionsList}
      value={value}
      onChange={onChange}
      isLoading={isLoading}
      menuPortalTarget={document.body}
      menuShouldScrollIntoView={false}
      menuPosition="fixed"
    />
  );
};

SelectComponent.propTypes = {
  optionsList: PropTypes.array,
  onChangeHandler: PropTypes.func,
  value: PropTypes.any,
  width: PropTypes.number,
  isLoading: PropTypes.bool,
  inputId: PropTypes.string,
};

export default React.memo(SelectComponent);
