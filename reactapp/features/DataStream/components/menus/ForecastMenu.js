import { Fragment, useMemo, useCallback, useEffect, useState, useRef } from 'react';
import DataMenu from '../forecast/dataMenu';
import VariablesMenu from '../forecast/variablesMenu';
import { Content, Container, CollapsibleRegion } from '../styles/Styles';
import TimeSeriesCard from '../forecast/TimeseriesCard';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useFeatureStore } from 'features/DataStream/store/Layers';
import { ForecastHeader } from '../forecast/ForecastHeader';
import { useShallow } from 'zustand/react/shallow';
import { useIsSheetLayout } from 'features/DataStream/lib/breakpoints';
import { peekFor } from 'features/DataStream/lib/sheetGeometry';

const ForecastMenu = () => {
  const { layout, reset, feature_id } = useTimeSeriesStore(
    useShallow((state) => ({
      feature_id: state.feature_id,
      layout: state.layout,
      reset: state.reset,
    }))
  );

  
  const isopen = useMemo(() => feature_id != null, [feature_id]);
  const isSheet = useIsSheetLayout();
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = collapsed && isSheet;
  const sheetRef = useRef(null);
  const rowRef = useRef(null);

  useEffect(() => {
    if (!isopen || !isSheet) {
      document.body.dataset.sheet = isopen ? 'expanded' : 'closed';
      setCollapsed(false);
      return;
    }
    document.body.dataset.sheet = isCollapsed ? 'collapsed' : 'expanded';
  }, [isopen, collapsed, isSheet]);

  useEffect(() => {
    if (!isopen || !isSheet) return;
    const sheet = sheetRef.current;
    const row = rowRef.current;
    if (!sheet || !row) return;
    const paddingTop = parseFloat(getComputedStyle(sheet).paddingTop) || 0;
    const peek = peekFor({ rowHeight: row.offsetHeight, paddingTop, sheetHeight: sheet.offsetHeight });
    document.body.style.setProperty('--sheet-peek', `${peek}px`);
  }, [isopen, isSheet, collapsed, layout?.title, layout?.subtitle]);

  useEffect(() => () => {
    delete document.body.dataset.sheet;
    document.body.style.removeProperty('--sheet-peek');
  }, []);

  const onReset = useCallback(() => {
    reset();
    useFeatureStore.getState().set_selected_feature(null);
  }, [reset]);
  
  return (
    <Fragment>          
          <Container
            as="aside"
            aria-label="Selected feature"
            $isOpen={isopen}
            $collapsed={isCollapsed}
            aria-hidden={!isopen || undefined}
            ref={sheetRef}
          >
            <div>
                  {layout?.title && (
                    <ForecastHeader
                      title={layout.title}
                      subtitle={layout.subtitle}
                      onClick={onReset}
                      collapsible={isSheet}
                      collapsed={isCollapsed}
                      onToggleCollapsed={() => setCollapsed((c) => !c)}
                      collapseControls="sheet-body"
                      rowRef={rowRef}
                    />
                  )}
            </div>

            <CollapsibleRegion
              id="sheet-body"
              role="group"
              aria-label="Forecast details"
              $collapsed={isCollapsed}
              aria-hidden={isCollapsed || undefined}
            >
              <Content>
                <TimeSeriesCard />
                <VariablesMenu />
              </Content>

              <Content>
                <DataMenu />
              </Content>
            </CollapsibleRegion>
          </Container>
    </Fragment>

  );
};

export default ForecastMenu;