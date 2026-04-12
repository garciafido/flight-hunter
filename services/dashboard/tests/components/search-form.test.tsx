import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SearchForm } from '@/components/search-form';

vi.mock('@/lib/api', () => ({
  createSearch: vi.fn(),
}));
import { createSearch } from '@/lib/api';

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

function getInputByName(name: string): HTMLInputElement {
  return document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
}

function fillBasics() {
  fireEvent.change(getInputByName('name'), { target: { name: 'name', value: 'Test' } });
  fireEvent.change(getInputByName('origin'), { target: { name: 'origin', value: 'BUE' } });
  fireEvent.change(getInputByName('departureFrom'), { target: { name: 'departureFrom', value: '2026-07-25' } });
  fireEvent.change(getInputByName('departureTo'), { target: { name: 'departureTo', value: '2026-07-31' } });
  fireEvent.change(getInputByName('maxPricePerPerson'), { target: { name: 'maxPricePerPerson', value: '1000' } });
}

function fillFirstWaypoint(airport: string) {
  // The form initializes with one waypoint card. Update its airport.
  const airportInputs = document.querySelectorAll('input[data-testid="waypoint-airport"]');
  fireEvent.change(airportInputs[0] as HTMLInputElement, { target: { value: airport } });
}

describe('SearchForm', () => {
  it('renders the four sections', () => {
    render(<SearchForm />);
    expect(screen.getByText('Información general')).toBeDefined();
    expect(screen.getByText('Itinerario')).toBeDefined();
    expect(screen.getByText('Alertas')).toBeDefined();
    expect(screen.getByText('Filtros del vuelo')).toBeDefined();
  });

  it('builds a filter payload from structured inputs', async () => {
    (createSearch as any).mockResolvedValue({ id: 'x' });
    render(<SearchForm />);
    fillBasics();
    fillFirstWaypoint('LIM');

    // Toggle requireCarryOn
    const carryOn = screen.getByTestId('filter-carryon') as HTMLInputElement;
    fireEvent.click(carryOn);

    // Set max stops to 0
    const maxStops = screen.getByTestId('filter-maxstops') as HTMLInputElement;
    fireEvent.change(maxStops, { target: { name: 'maxUnplannedStops', value: '0' } });

    // Set max travel hours to 24
    const maxTravel = screen.getByTestId('filter-maxtravel') as HTMLInputElement;
    fireEvent.change(maxTravel, { target: { name: 'maxTotalTravelHours', value: '24' } });

    // Set blacklist
    const blacklist = screen.getByTestId('filter-blacklist') as HTMLInputElement;
    fireEvent.change(blacklist, { target: { name: 'airlineBlacklist', value: 'JetSMART, Sky Airline' } });

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      const payload = (createSearch as any).mock.calls[0][0];
      expect(payload.filters.requireCarryOn).toBe(true);
      expect(payload.filters.maxUnplannedStops).toBe(0);
      expect(payload.filters.maxTotalTravelTime).toBe(24);
      expect(payload.filters.airlineBlacklist).toEqual(['JetSMART', 'Sky Airline']);
    });
  });

  it('starts with one default waypoint card', () => {
    render(<SearchForm />);
    const cards = document.querySelectorAll('input[data-testid="waypoint-airport"]');
    expect(cards.length).toBe(1);
  });

  it('renders origin anchors at top and bottom of the chain', () => {
    render(<SearchForm />);
    const anchors = screen.getAllByText(/origen|regreso/i);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
  });

  it('inserts a new waypoint when "+ Insertar parada" is clicked', () => {
    render(<SearchForm />);
    const initial = document.querySelectorAll('input[data-testid="waypoint-airport"]').length;
    const insertButtons = screen.getAllByText('+ Insertar parada');
    fireEvent.click(insertButtons[0]);
    const after = document.querySelectorAll('input[data-testid="waypoint-airport"]').length;
    expect(after).toBe(initial + 1);
  });

  it('removes a waypoint when ✕ is clicked', () => {
    render(<SearchForm />);
    // Insert one extra so we have 2
    fireEvent.click(screen.getAllByText('+ Insertar parada')[0]);
    expect(document.querySelectorAll('input[data-testid="waypoint-airport"]').length).toBe(2);
    const removeButtons = document.querySelectorAll('button[data-testid="waypoint-remove"]');
    fireEvent.click(removeButtons[0]);
    expect(document.querySelectorAll('input[data-testid="waypoint-airport"]').length).toBe(1);
  });

  it('switching to connection type swaps stay inputs for hours input', () => {
    render(<SearchForm />);
    const stayRadio = document.querySelector('input[type="radio"][value="stay"]') as HTMLInputElement;
    const connRadio = document.querySelector('input[type="radio"][value="connection"]') as HTMLInputElement;
    expect(stayRadio.checked).toBe(true);
    fireEvent.click(connRadio);
    // After switching, hours input should be present
    expect(document.querySelector('input[data-testid="waypoint-maxhours"]')).not.toBeNull();
    expect(document.querySelector('input[data-testid="waypoint-mindays"]')).toBeNull();
  });

  it('builds a correct waypoint payload on submit', async () => {
    (createSearch as any).mockResolvedValue({ id: 'x' });
    render(<SearchForm />);
    fillBasics();
    fillFirstWaypoint('LIM');
    // Set min/max days for the first waypoint
    const minDaysInputs = document.querySelectorAll('input[data-testid="waypoint-mindays"]');
    fireEvent.change(minDaysInputs[0] as HTMLInputElement, { target: { value: '3' } });
    const maxDaysInputs = document.querySelectorAll('input[data-testid="waypoint-maxdays"]');
    fireEvent.change(maxDaysInputs[0] as HTMLInputElement, { target: { value: '4' } });

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      const payload = (createSearch as any).mock.calls[0][0];
      expect(payload.origin).toBe('BUE');
      expect(payload.waypoints).toEqual([
        {
          airport: 'LIM',
          gap: { type: 'stay', minDays: 3, maxDays: 4 },
          checkedBags: 0,
        },
      ]);
    });
  });

  it('builds a connection-type payload', async () => {
    (createSearch as any).mockResolvedValue({ id: 'x' });
    render(<SearchForm />);
    fillBasics();
    fillFirstWaypoint('GRU');
    const connRadio = document.querySelector('input[type="radio"][value="connection"]') as HTMLInputElement;
    fireEvent.click(connRadio);
    const hoursInput = document.querySelector('input[data-testid="waypoint-maxhours"]') as HTMLInputElement;
    fireEvent.change(hoursInput, { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      const payload = (createSearch as any).mock.calls[0][0];
      expect(payload.waypoints[0]).toEqual({
        airport: 'GRU',
        gap: { type: 'connection', maxHours: 5 },
        checkedBags: 0,
      });
    });
  });

  it('rejects two waypoints pinned as first', async () => {
    render(<SearchForm />);
    fillBasics();
    fillFirstWaypoint('LIM');

    // Insert a second waypoint
    fireEvent.click(screen.getAllByText('+ Insertar parada')[0]);
    const airports = document.querySelectorAll('input[data-testid="waypoint-airport"]');
    fireEvent.change(airports[1] as HTMLInputElement, { target: { value: 'CUZ' } });

    // Pin both as 'first'
    const pinSelects = document.querySelectorAll('select[data-testid="waypoint-pin"]') as NodeListOf<HTMLSelectElement>;
    fireEvent.change(pinSelects[0], { target: { value: 'first' } });
    fireEvent.change(pinSelects[1], { target: { value: 'first' } });

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      expect(screen.getByText(/Solo una parada puede ser pineada como primera/)).toBeDefined();
    });
    expect(createSearch).not.toHaveBeenCalled();
  });

  it('rejects an invalid airport code', async () => {
    render(<SearchForm />);
    fillBasics();
    fillFirstWaypoint('XX'); // 2 letters, invalid

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      expect(screen.getByText(/Aeropuerto inválido/)).toBeDefined();
    });
    expect(createSearch).not.toHaveBeenCalled();
  });

  it('calls onCreated with the result on success', async () => {
    const onCreated = vi.fn();
    (createSearch as any).mockResolvedValue({ id: 'new-id' });
    render(<SearchForm onCreated={onCreated} />);
    fillBasics();
    fillFirstWaypoint('LIM');

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ id: 'new-id' });
    });
  });

  it('shows error message when createSearch fails', async () => {
    (createSearch as any).mockRejectedValue(new Error('Server error'));
    render(<SearchForm />);
    fillBasics();
    fillFirstWaypoint('LIM');

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeDefined();
    });
  });
});
