-- Local cancellation before generation; never represents MH invalidation.
ALTER TYPE "DteOutgoingStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
