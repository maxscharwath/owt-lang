// Mirrors frameworks/keyed/react-hooks in js-framework-benchmark:
// a single useReducer holds { data, selected }, rows are memo() components.
import { memo, useReducer, type Dispatch } from 'react';
import { createRoot } from 'react-dom/client';
import { buildData, type Row as RowData } from '../../../shared/data';

interface State {
  data: RowData[];
  selected: number;
}

type Action =
  | { type: 'RUN' }
  | { type: 'RUN_LOTS' }
  | { type: 'ADD' }
  | { type: 'UPDATE' }
  | { type: 'CLEAR' }
  | { type: 'SWAP_ROWS' }
  | { type: 'REMOVE'; id: number }
  | { type: 'SELECT'; id: number };

const initialState: State = { data: [], selected: 0 };

function listReducer(state: State, action: Action): State {
  const { data, selected } = state;
  switch (action.type) {
    case 'RUN':
      return { data: buildData(1000), selected: 0 };
    case 'RUN_LOTS':
      return { data: buildData(10000), selected: 0 };
    case 'ADD':
      return { data: data.concat(buildData(1000)), selected };
    case 'UPDATE': {
      const newData = data.slice(0);
      for (let i = 0; i < newData.length; i += 10) {
        const r = newData[i]!;
        newData[i] = { id: r.id, label: r.label + ' !!!' };
      }
      return { data: newData, selected };
    }
    case 'CLEAR':
      return { data: [], selected: 0 };
    case 'SWAP_ROWS': {
      const newData = [...data];
      if (data.length > 998) {
        const d1 = newData[1]!;
        newData[1] = newData[998]!;
        newData[998] = d1;
      }
      return { data: newData, selected };
    }
    case 'REMOVE': {
      const idx = data.findIndex((d) => d.id === action.id);
      return { data: [...data.slice(0, idx), ...data.slice(idx + 1)], selected };
    }
    case 'SELECT':
      return { data, selected: action.id };
    default:
      return state;
  }
}

interface RowProps {
  selected: boolean;
  item: RowData;
  dispatch: Dispatch<Action>;
}

const Row = memo(({ selected, item, dispatch }: RowProps) => (
  <tr className={selected ? 'danger' : ''}>
    <td className="col-md-1">{item.id}</td>
    <td className="col-md-4">
      <a onClick={() => dispatch({ type: 'SELECT', id: item.id })}>{item.label}</a>
    </td>
    <td className="col-md-1">
      <a onClick={() => dispatch({ type: 'REMOVE', id: item.id })}>
        <span className="remove glyphicon glyphicon-remove" aria-hidden="true" />
      </a>
    </td>
    <td className="col-md-6" />
  </tr>
));

interface ButtonProps {
  id: string;
  title: string;
  cb: () => void;
}

const Button = ({ id, cb, title }: ButtonProps) => (
  <div className="col-sm-6 smallpad">
    <button type="button" className="btn btn-primary btn-block" id={id} onClick={cb}>
      {title}
    </button>
  </div>
);

const Jumbotron = memo(
  ({ dispatch }: { dispatch: Dispatch<Action> }) => (
    <div className="jumbotron">
      <div className="row">
        <div className="col-md-6">
          <h1>React 19 hooks (keyed)</h1>
        </div>
        <div className="col-md-6">
          <div className="row">
            <Button id="run" title="Create 1,000 rows" cb={() => dispatch({ type: 'RUN' })} />
            <Button id="runlots" title="Create 10,000 rows" cb={() => dispatch({ type: 'RUN_LOTS' })} />
            <Button id="add" title="Append 1,000 rows" cb={() => dispatch({ type: 'ADD' })} />
            <Button id="update" title="Update every 10th row" cb={() => dispatch({ type: 'UPDATE' })} />
            <Button id="clear" title="Clear" cb={() => dispatch({ type: 'CLEAR' })} />
            <Button id="swaprows" title="Swap Rows" cb={() => dispatch({ type: 'SWAP_ROWS' })} />
          </div>
        </div>
      </div>
    </div>
  ),
  () => true,
);

function Main() {
  const [{ data, selected }, dispatch] = useReducer(listReducer, initialState);

  return (
    <div className="container">
      <Jumbotron dispatch={dispatch} />
      <table className="table table-hover table-striped test-data">
        <tbody id="tbody">
          {data.map((item) => (
            <Row key={item.id} item={item} selected={selected === item.id} dispatch={dispatch} />
          ))}
        </tbody>
      </table>
      <span className="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
}

createRoot(document.getElementById('main')!).render(<Main />);
