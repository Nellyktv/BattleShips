import React from 'react';
import {
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { Preset } from '@battleships/contracts';

export interface CreateGameProps {
  open: boolean;
  onClose: () => void;
  onCreate: (preset: Preset) => void;
  disabled?: boolean;
}
const cards: Array<{ preset: Preset; title: string; detail: string }> = [
  {
    preset: 'quick-8x8',
    title: 'Quick 8×8',
    detail: 'Fast skirmish · 4 ships',
  },
  {
    preset: 'classic-10x10',
    title: 'Classic 10×10',
    detail: 'The standard fleet · 5 ships',
  },
  {
    preset: 'grand-12x12',
    title: 'Grand 12×12',
    detail: 'Full-scale command · 7 ships',
  },
];
export function CreateGame({
  open,
  onClose,
  onCreate,
  disabled = false,
}: CreateGameProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Choose a fleet preset</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {cards.map((card) => (
            <Card key={card.preset} variant="outlined">
              <CardActionArea
                disabled={disabled}
                onClick={() => onCreate(card.preset)}
              >
                <CardContent>
                  <Typography variant="h6">{card.title}</Typography>
                  <Typography color="text.secondary">{card.detail}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
