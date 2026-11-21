-- Valor de enum en su propia migracion: PostgreSQL no permite usar un valor nuevo de un enum
-- (por ejemplo en un CHECK) dentro de la misma transaccion que lo crea.
ALTER TYPE "EstadoUsuario" ADD VALUE 'pendiente_activacion';
