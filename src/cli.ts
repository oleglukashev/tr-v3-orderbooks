import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli.module';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  await CommandFactory.run(CliModule, ['warn', 'error']);
}

void bootstrap();
