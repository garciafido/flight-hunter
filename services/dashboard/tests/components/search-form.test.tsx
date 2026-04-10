import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SearchForm } from '@/components/search-form';

vi.mock('@/lib/api', () => ({
  createSearch: vi.fn(),
}));

import { createSearch } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

function getInputByName(name: string): HTMLInputElement {
  return document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
}

function getTextareaByName(name: string): HTMLTextAreaElement {
  return document.querySelector(`textarea[name="${name}"]`) as HTMLTextAreaElement;
}

function fillRequiredFields() {
  fireEvent.change(getInputByName('name'), { target: { name: 'name', value: 'Test Search' } });
  fireEvent.change(getInputByName('origin'), { target: { name: 'origin', value: 'SCL' } });
  fireEvent.change(getInputByName('destination'), { target: { name: 'destination', value: 'MAD' } });
  fireEvent.change(getInputByName('departureFrom'), { target: { name: 'departureFrom', value: '2026-06-01' } });
  fireEvent.change(getInputByName('departureTo'), { target: { name: 'departureTo', value: '2026-06-30' } });
  fireEvent.change(getInputByName('returnMinDays'), { target: { name: 'returnMinDays', value: '7' } });
  fireEvent.change(getInputByName('returnMaxDays'), { target: { name: 'returnMaxDays', value: '14' } });
  fireEvent.change(getInputByName('maxPricePerPerson'), { target: { name: 'maxPricePerPerson', value: '1000' } });
}

describe('SearchForm', () => {
  it('renders all major sections', () => {
    render(<SearchForm />);
    expect(screen.getByText('Información General')).toBeDefined();
    expect(screen.getByText('Escala (Opcional)')).toBeDefined();
    expect(screen.getByText('Fechas y Estadía')).toBeDefined();
    expect(screen.getByText('Filtros (JSON)')).toBeDefined();
    expect(screen.getByText('Configuración de Alertas')).toBeDefined();
    expect(screen.getByText('Regiones de Proxy')).toBeDefined();
    expect(screen.getByText('Escaneo')).toBeDefined();
  });

  it('renders submit button', () => {
    render(<SearchForm />);
    expect(screen.getByRole('button', { name: /crear búsqueda/i })).toBeDefined();
  });

  it('calls createSearch and onCreated on successful submit', async () => {
    const mockSearch = { id: 'new-id', name: 'Test Search' };
    (createSearch as any).mockResolvedValue(mockSearch);
    const onCreated = vi.fn();

    render(<SearchForm onCreated={onCreated} />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      expect(createSearch).toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith(mockSearch);
    });
  });

  it('shows error message when createSearch fails', async () => {
    (createSearch as any).mockRejectedValue(new Error('Server error'));

    render(<SearchForm />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeDefined();
    });
  });

  it('shows generic error for non-Error exceptions', async () => {
    (createSearch as any).mockRejectedValue('oops');

    render(<SearchForm />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      expect(screen.getByText('Error al crear búsqueda')).toBeDefined();
    });
  });

  it('toggles proxy region checkboxes', () => {
    render(<SearchForm />);
    const clCheckbox = screen.getByRole('checkbox', { name: 'CL' }) as HTMLInputElement;
    expect(clCheckbox.checked).toBe(false);
    fireEvent.click(clCheckbox);
    expect(clCheckbox.checked).toBe(true);
    fireEvent.click(clCheckbox);
    expect(clCheckbox.checked).toBe(false);
  });

  it('includes stopover in payload when stopoverAirport is filled', async () => {
    (createSearch as any).mockResolvedValue({ id: 'x' });
    render(<SearchForm />);
    fillRequiredFields();

    fireEvent.change(getInputByName('stopoverAirport'), { target: { name: 'stopoverAirport', value: 'LHR' } });
    fireEvent.change(getInputByName('stopoverMinDays'), { target: { name: 'stopoverMinDays', value: '2' } });
    fireEvent.change(getInputByName('stopoverMaxDays'), { target: { name: 'stopoverMaxDays', value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      const payload = (createSearch as any).mock.calls[0][0];
      expect(payload.stopover).toEqual({ airport: 'LHR', minDays: 2, maxDays: 5 });
    });
  });

  it('handles invalid JSON in filters gracefully', async () => {
    (createSearch as any).mockResolvedValue({ id: 'x' });
    render(<SearchForm />);
    fillRequiredFields();

    fireEvent.change(getTextareaByName('filters'), { target: { name: 'filters', value: 'invalid json' } });

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      const payload = (createSearch as any).mock.calls[0][0];
      expect(payload.filters).toEqual({});
    });
  });

  it('does not include optional prices when empty', async () => {
    (createSearch as any).mockResolvedValue({ id: 'x' });
    render(<SearchForm />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      const payload = (createSearch as any).mock.calls[0][0];
      expect(payload.alertConfig.targetPricePerPerson).toBeUndefined();
      expect(payload.alertConfig.dreamPricePerPerson).toBeUndefined();
    });
  });

  it('includes optional prices when filled', async () => {
    (createSearch as any).mockResolvedValue({ id: 'x' });
    render(<SearchForm />);
    fillRequiredFields();

    fireEvent.change(getInputByName('targetPricePerPerson'), { target: { name: 'targetPricePerPerson', value: '700' } });
    fireEvent.change(getInputByName('dreamPricePerPerson'), { target: { name: 'dreamPricePerPerson', value: '500' } });

    fireEvent.click(screen.getByRole('button', { name: /crear búsqueda/i }));

    await waitFor(() => {
      const payload = (createSearch as any).mock.calls[0][0];
      expect(payload.alertConfig.targetPricePerPerson).toBe(700);
      expect(payload.alertConfig.dreamPricePerPerson).toBe(500);
    });
  });
});
