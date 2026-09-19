import { Module } from '@nestjs/common';
import { SliderController } from './slider.controller';
import { SliderService } from './slider.service';

@Module({
  controllers: [SliderController],
  providers: [SliderService],
  exports: [SliderService],
})
export class SliderModule {}
