/** Regresión visual/funcional ejecutada por smoke-permissions con su fixture local. */
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Secciones con ruta propia en la barra lateral; /generador/trabajos también está en NAV (Generaciones).
const sections=['/','/calendario','/contenido','/tareas','/marcas','/generador','/guiones','/estructuras','/arquetipos','/metricas','/manual','/tutorial','/equipo','/actividad','/ajustes'];
const navLinks=[...sections,'/generador/trabajos'];

export async function checkDesignUi(page, base, db) {
  const checks={routes:[],viewports:[],interactions:[]};
  const main=page.getByRole('main');
  const desktopNav=page.locator('aside').first().getByRole('navigation',{name:'Navegación principal'});
  await expect(desktopNav.locator('a')).toHaveCount(navLinks.length);
  await expect(page.getByRole('button',{name:'Cerrar menú',exact:true})).toHaveCount(0);
  assert.deepEqual((await desktopNav.locator('a').evaluateAll(links=>links.map(link=>link.getAttribute('href')))).sort(),[...navLinks].sort());
  for(const route of [...sections,'/generador/trabajos','/guiones/script','/contenido/assigned','/marcas/A','/estructuras/structure','/arquetipos/person','/mi-perfil','/manual/filmmaker','/manual/filmmaker/fm-p2']) {
    const response=await page.goto(base+route);
    assert.equal(response.status(),200,route);
    await expect(main.locator('h1')).toBeVisible();
    await expect(main).not.toContainText('Something went wrong');
    checks.routes.push(route);
  }
  console.log(`[design] ${checks.routes.length} rutas y navegación conservadas`);

  // Teclado y cookies: el menú conserva la acción de cambiar el alcance de marca.
  const brandTrigger=page.locator('aside').first().getByRole('button',{name:/Cambiar marca:/});
  await brandTrigger.focus();await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');await expect(brandTrigger).toBeFocused();
  await brandTrigger.click();await page.getByRole('menuitem',{name:'Marca Autorizada',exact:true}).click();
  await expect(brandTrigger).toHaveAccessibleName('Cambiar marca: Marca Autorizada');
  await page.goto(base+'/contenido');await expect(main).not.toContainText('VIDEO_SECRETO');
  await brandTrigger.click();await page.getByRole('menuitem',{name:'Todas las marcas',exact:true}).click();
  await expect(brandTrigger).toHaveAccessibleName('Cambiar marca: Todas las marcas');
  checks.interactions.push('brand-switch-and-keyboard');

  // El selector nativo sigue escribiendo filtros en la URL y admite volver atrás.
  await page.goto(base+'/guiones');
  const filter=main.getByRole('combobox',{name:'Todos los estados',exact:true});
  const option=await filter.locator('option').nth(1).getAttribute('value');
  await filter.selectOption(option);
  await expect.poll(()=>new URL(page.url()).searchParams.get('estado')).toBe(option);
  await filter.selectOption('');await expect.poll(()=>new URL(page.url()).searchParams.has('estado')).toBe(false);
  checks.interactions.push('native-filter-url');

  // Confirmación: cancelar/Escape no borran; el foco vuelve al botón original.
  await db.asset.create({data:{id:'design-asset',ownerType:'structure',ownerId:'structure',filename:'diseno-qa.txt',mimeType:'text/plain',size:2,data:Buffer.from('QA')}});
  await page.goto(base+'/estructuras/structure?vista=documentos');
  const row=main.getByRole('listitem').filter({hasText:'diseno-qa.txt'});
  const remove=row.getByRole('button',{name:'¿Eliminar este archivo?',exact:true});
  await remove.click();const dialog=page.getByRole('dialog',{name:'¿Eliminar este archivo?',exact:true});
  await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
  for(let n=0;n<5;n++){await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));}
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(remove).toBeFocused();
  assert.equal(await db.asset.count({where:{id:'design-asset'}}),1);
  await remove.click();await dialog.getByRole('button',{name:'Sí, eliminar',exact:true}).click();
  await expect.poll(()=>db.asset.count({where:{id:'design-asset'}})).toBe(0);
  checks.interactions.push('dialog-focus-cancel-delete');

  // Una confirmación anidada no cierra ni envía el formulario de edición padre.
  await page.goto(base+'/equipo');
  await main.getByRole('row').filter({has:page.getByText('EMPTY',{exact:true})}).getByRole('button',{name:'Editar',exact:true}).click();
  const parentDialog=page.getByRole('dialog',{name:'EMPTY',exact:true});
  await parentDialog.locator('input[name="name"]').fill('Borrador que se conserva');
  await parentDialog.getByRole('button',{name:'Eliminar del equipo',exact:true}).click();
  const nestedDialog=page.getByRole('dialog',{name:'¿Eliminar a EMPTY?',exact:true});
  await expect(nestedDialog).toBeVisible();await page.keyboard.press('Escape');
  await expect(nestedDialog).toHaveCount(0);await expect(parentDialog).toBeVisible();
  await expect(parentDialog.locator('input[name="name"]')).toHaveValue('Borrador que se conserva');
  await parentDialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  assert.equal((await db.user.findUniqueOrThrow({where:{id:'EMPTY'}})).name,'EMPTY');
  checks.interactions.push('nested-dialog-keeps-parent-draft');
  console.log('[design] Marca, filtros y confirmación verificados');

  // Paneles claros/oscuros y pantallas de trabajo a 360/768/1440 px.
  for(const width of [1440,768,360]) {
    await page.setViewportSize({width,height:900});
    for(const theme of ['light','dark']) {
      await page.evaluate(value=>{localStorage.setItem('mos-theme',value);document.documentElement.classList.toggle('dark',value==='dark');},theme);
      for(const route of ['/','/guiones','/generador','/tareas','/calendario','/ajustes']) {
        await page.goto(base+route);await expect(main.locator('h1')).toBeVisible();
        const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,font:getComputedStyle(document.body).fontFamily}));
        assert.ok(dimensions.scroll<=dimensions.client+1,`${route} ${width} ${theme}: desborde ${dimensions.scroll}`);
        assert.ok(dimensions.font.includes('Manrope'));
        checks.viewports.push({width,theme,route});
        if(route==='/'&&(width===1440||width===360))await page.screenshot({path:`.audit/intia-${theme}-${width}.png`,animations:'disabled'});
      }
      if(width<1024){
        await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
        const mobileNav=page.getByRole('navigation',{name:'Navegación principal'}).filter({visible:true});
        await expect(mobileNav.locator('a')).toHaveCount(navLinks.length);
        await mobileNav.getByRole('link',{name:'Guiones',exact:true}).click();
        await expect(main.getByRole('heading',{name:'Guiones',exact:true})).toBeVisible();
        await expect(mobileNav).toHaveCount(0);
      }
    }
  }

  // Los dos controles del tema (cabecera y cajón) se mantienen sincronizados.
  await page.getByRole('button',{name:'Cambiar a tema claro',exact:true}).filter({visible:true}).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cambiar a tema oscuro',exact:true}).filter({visible:true})).toHaveCount(2);
  await page.getByRole('button',{name:'Cerrar menú',exact:true}).filter({visible:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  checks.interactions.push('mobile-navigation-and-theme-sync');

  // La guía mantiene sus anclas y puede avanzar dentro del formulario de marca.
  await page.goto(base+'/tutorial');await page.getByRole('button',{name:'Iniciar guía interactiva',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Paso guiado',exact:true})).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('marketing_os_guia_state_v2',JSON.stringify({activo:true,terminado:false,minimizado:false,moduloIndex:0,pasoIndex:2,moduloId:'modulo-1',pasoId:'m1-nombre',completados:[]})));
  await page.goto(base+'/marcas');
  await main.getByRole('button',{name:'Nueva marca',exact:true}).click();
  const brandDialog=page.getByRole('dialog',{name:'Nueva marca',exact:true});
  await brandDialog.locator('input[name="name"]').fill('Borrador de diseño');
  await page.getByRole('button',{name:'Cerrar tutorial',exact:true}).click();
  await expect(brandDialog.locator('input[name="name"]')).toHaveValue('Borrador de diseño');
  await brandDialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  assert.equal(await db.brand.count({where:{name:'Borrador de diseño'}}),0);
  checks.interactions.push('guided-editor-preserves-form');

  // El acceso al perfil sigue disponible desde el menú de usuario.
  await page.locator('aside').first().getByRole('button',{name:'Menú de OWNER',exact:true}).click();
  await page.getByRole('menuitem',{name:'Mi perfil',exact:true}).click();
  await page.waitForURL(base+'/mi-perfil');
  checks.interactions.push('user-profile-menu');
  return checks;
}
