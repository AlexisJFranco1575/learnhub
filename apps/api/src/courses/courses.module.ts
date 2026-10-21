import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  controllers: [CoursesController, EnrollmentsController],
  providers: [CoursesService, EnrollmentsService],
})
export class CoursesModule {}