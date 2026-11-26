import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CommandItemDto } from './Item.dto';

describe('CommandItemDto unit', () => {
  it.each([undefined, 'piece', 'box'])(
    'accepts the optional unit %p',
    async (unit) => {
      const dto = plainToInstance(CommandItemDto, {
        name: 'Paper case',
        type: 'service',
        ...(unit === undefined ? {} : { unit }),
      });
      expect(await validate(dto)).toEqual([]);
    },
  );

  it('rejects a supplied unsupported unit', async () => {
    const dto = plainToInstance(CommandItemDto, {
      name: 'Paper case',
      type: 'service',
      unit: 'not-a-unit',
    });
    const errors = await validate(dto);
    expect(
      errors.find((error) => error.property === 'unit')?.constraints,
    ).toHaveProperty('isIn');
  });
});
